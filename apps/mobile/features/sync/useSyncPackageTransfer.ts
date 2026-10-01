import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useAppToast } from '@/components/ui/AppToastProvider';
import { useAttachmentStorageAccess } from '@/data/attachments/AttachmentStorageAccessProvider';
import { createDrizzleDatabase } from '@/data/sqlite/database';
import { createExpoSyncExporter } from '@/data/sqlite/sync/export/createExpoSyncExporter';
import { createExpoSyncImporter } from '@/data/sqlite/sync/import/createExpoSyncImporter';
import type { SyncTransferProgress } from './SyncTransferProgressModal';

export type SyncTransferStatus = 'idle' | 'exporting' | 'importing';
type TransferKind = Exclude<SyncTransferStatus, 'idle'>;

export function useSyncPackageTransfer() {
  const sqlite = useSQLiteContext();
  const storageAccess = useAttachmentStorageAccess();
  const queryClient = useQueryClient();
  const { showToast } = useAppToast();
  const database = useMemo(() => createDrizzleDatabase(sqlite), [sqlite]);
  const exportPackage = useMemo(
    () =>
      createExpoSyncExporter({
        database,
        storageAccess,
        createId: randomUUID,
        now: () => new Date().toISOString(),
      }),
    [database, storageAccess]
  );
  const importPackage = useMemo(
    () =>
      createExpoSyncImporter({
        database,
        storageAccess,
        now: () => new Date().toISOString(),
      }),
    [database, storageAccess]
  );

  const [status, setStatus] = useState<SyncTransferStatus>('idle');
  const [progress, setProgress] = useState<SyncTransferProgress | null>(null);
  const [error, setError] = useState<{
    kind: TransferKind;
    message: string;
  } | null>(null);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const currentProgress = useRef<SyncTransferProgress | null>(null);
  const retryImportUri = useRef<string | null>(null);

  const updateProgress = useCallback((next: SyncTransferProgress | null) => {
    currentProgress.current = next;
    setProgress(next);
  }, []);

  const sharePackage = useCallback(
    async (uri: string) => {
      try {
        if (!(await Sharing.isAvailableAsync()))
          throw new Error('Sharing is not available on this device.');
        await Sharing.shareAsync(uri, {
          dialogTitle: 'Share sync package',
          mimeType: 'application/zip',
        });
        showToast({
          message: 'Sync package ready',
          duration: 7_000,
          actions: [
            { label: 'Share again', onPress: () => void sharePackage(uri) },
          ],
        });
      } catch (shareError) {
        showToast({
          message:
            shareError instanceof Error
              ? shareError.message
              : 'The sync package could not be shared.',
          kind: 'error',
          actions: [
            { label: 'Share again', onPress: () => void sharePackage(uri) },
          ],
        });
      }
    },
    [showToast]
  );

  const startExport = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus('exporting');
    const abort = new AbortController();
    controller.current = abort;
    setError(null);
    updateProgress({
      kind: 'exporting',
      phase: 'preparing',
      cancellable: true,
    });
    try {
      const result = await exportPackage({
        signal: abort.signal,
        onProgress: (next) => {
          if (!abort.signal.aborted)
            updateProgress({ kind: 'exporting', ...next });
        },
      });
      updateProgress(null);
      // Let the native progress modal close before presenting the share sheet.
      await new Promise((resolve) => setTimeout(resolve, 250));
      await sharePackage(result.uri);
    } catch (exportError) {
      updateProgress(null);
      if (!(exportError instanceof Error && exportError.name === 'AbortError'))
        setError({
          kind: 'exporting',
          message:
            exportError instanceof Error
              ? exportError.message
              : 'The sync package could not be exported.',
        });
    } finally {
      controller.current = null;
      running.current = false;
      setStatus('idle');
    }
  }, [exportPackage, sharePackage, updateProgress]);

  const startImport = useCallback(
    async (uri?: string) => {
      if (running.current) return;
      running.current = true;
      setStatus('importing');
      setError(null);
      const abort = new AbortController();
      controller.current = abort;
      try {
        let packageUri = uri;
        if (!packageUri) {
          retryImportUri.current = null;
          const selected = await DocumentPicker.getDocumentAsync({
            copyToCacheDirectory: true,
            multiple: false,
            type: '*/*',
          });
          if (selected.canceled || !selected.assets[0]) return;
          packageUri = selected.assets[0].uri;
        }
        retryImportUri.current = packageUri;
        updateProgress({
          kind: 'importing',
          phase: 'preparing',
          cancellable: true,
        });
        const result = await importPackage(packageUri, {
          signal: abort.signal,
          onProgress: (next) => updateProgress({ kind: 'importing', ...next }),
        });
        updateProgress(null);
        try {
          await queryClient.invalidateQueries();
        } catch {
          showToast({
            message:
              'Sync imported, but the view could not be refreshed. Reopen the app to see the changes.',
            kind: 'error',
          });
          return;
        }
        const issues = result.blobs.stillMissing + result.blobs.failed;
        const operationMessage =
          result.operations.status === 'already-covered'
            ? 'Sync history was already up to date'
            : `${result.operations.applied.toLocaleString()} sync operations imported`;
        showToast({
          message:
            issues > 0
              ? `${operationMessage}; ${issues.toLocaleString()} attachment files unavailable`
              : result.blobs.cancelled
                ? `${operationMessage}; attachment repair stopped`
                : operationMessage,
          duration: 7_000,
        });
      } catch (importError) {
        updateProgress(null);
        if (!(
          importError instanceof Error && importError.name === 'AbortError'
        ))
          setError({
            kind: 'importing',
            message:
              importError instanceof Error
                ? importError.message
                : 'The sync package could not be imported.',
          });
      } finally {
        controller.current = null;
        running.current = false;
        setStatus('idle');
      }
    },
    [importPackage, queryClient, showToast, updateProgress]
  );

  const cancel = useCallback(() => {
    const progress = currentProgress.current;
    if (!progress?.cancellable) return;
    if (progress.kind === 'exporting') {
      updateProgress({ ...progress, stopping: true, cancellable: false });
    }
    controller.current?.abort();
  }, [updateProgress]);

  const retry = useCallback(() => {
    if (error?.kind === 'exporting') void startExport();
    else if (error?.kind === 'importing')
      void startImport(retryImportUri.current ?? undefined);
  }, [error, startExport, startImport]);

  const closeError = useCallback(() => setError(null), []);
  const selectImportPackage = useCallback(() => startImport(), [startImport]);

  return useMemo(
    () => ({
      status,
      progress,
      error,
      cancel,
      retry,
      closeError,
      exportPackage: startExport,
      importPackage: selectImportPackage,
    }),
    [
      status,
      progress,
      error,
      cancel,
      retry,
      closeError,
      startExport,
      selectImportPackage,
    ]
  );
}
