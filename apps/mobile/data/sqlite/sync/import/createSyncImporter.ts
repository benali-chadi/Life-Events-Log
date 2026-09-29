import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { strFromU8 } from 'fflate';
import type { AppDatabase, SyncTransaction } from '../../database';
import { syncFrontiers } from '../../schema';
import type { AttachmentStorageAccess } from '../../../attachments/storageAccess';
import type { CausalContext } from '../types';
import { sealPendingOperations } from '../pending/sealPendingOperations';
import { applyOperation } from '../applyOperation';
import { checkCancellation, validateSyncPackage } from './validateSyncPackage';
import {
  findMissingLiveBlobHashes,
  fixLiveAttachmentBlobs,
} from './fixLiveAttachmentBlobs';
import {
  SyncPackageError,
  type PreparedSyncPackage,
  type SyncImportOptions,
  type SyncImportResult,
} from './types';

export type SyncImportDependencies = {
  database: AppDatabase;
  storageAccess: AttachmentStorageAccess;
  now(): string;
  openPackage(uri: string, signal?: AbortSignal): Promise<PreparedSyncPackage>;
  isBlobAvailable(hash: string): boolean;
  yieldToApp?: () => Promise<void>;
};

function frontierCovers(tx: SyncTransaction, target: CausalContext): boolean {
  const local = new Map(
    tx
      .select()
      .from(syncFrontiers)
      .all()
      .map((row) => [row.originDeviceId, row.processedSequence])
  );
  return Object.entries(target).every(
    ([origin, sequence]) => (local.get(origin) ?? 0) >= sequence
  );
}

/** Local pending intent and all incoming operations commit or roll back together. */
export function createSyncImporter({
  database,
  storageAccess,
  now,
  openPackage,
  isBlobAvailable,
  yieldToApp = () => new Promise((resolve) => setTimeout(resolve, 0)),
}: SyncImportDependencies) {
  return async function importSyncPackage(
    packageUri: string,
    options: SyncImportOptions = {}
  ): Promise<SyncImportResult> {
    return storageAccess.withAccess(async () => {
      checkCancellation(options.signal);
      options.onProgress?.({ phase: 'preparing', cancellable: true });
      await yieldToApp();
      checkCancellation(options.signal);
      const prepared = await validateSyncPackage(
        packageUri,
        database,
        openPackage,
        options.signal
      );
      try {
        checkCancellation(options.signal);
        if (
          !database.transaction((tx) =>
            frontierCovers(tx, prepared.manifest.exporterFrontier)
          )
        )
          await prepared.prepareOperations(options.signal);
        checkCancellation(options.signal);
        options.onProgress?.({
          phase: 'applying-operations',
          cancellable: false,
        });
        await yieldToApp();
        checkCancellation(options.signal);
        // Cancellation is intentionally not consulted once the transaction starts.
        const operations: SyncImportResult['operations'] = database.transaction(
          (tx) => {
            if (frontierCovers(tx, prepared.manifest.exporterFrontier))
              return {
                status: 'already-covered' as const,
                applied: 0 as const,
              };
            sealPendingOperations(tx, { now });
            let applied = 0;
            let alreadyPresent = 0;
            let count = 0;
            let byteLength = 0;
            const digest = sha256.create();
            prepared.forEachOperationLine((line) => {
              digest.update(line);
              byteLength += line.byteLength;
              count++;
              if (
                count > prepared.manifest.operations.count ||
                byteLength > prepared.manifest.operations.byteLength
              )
                throw new SyncPackageError(
                  'Operations exceed manifest count or length.'
                );
              if (line.length < 2 || line[line.length - 1] !== 10)
                throw new SyncPackageError('Invalid operations JSONL line.');
              let operation: unknown;
              try {
                operation = JSON.parse(strFromU8(line.subarray(0, -1)));
              } catch {
                throw new SyncPackageError('Invalid operations JSONL data.');
              }
              // The manifest describes the exact history snapshot in this file.
              if (
                operation === null ||
                typeof operation !== 'object' ||
                !('originDeviceId' in operation) ||
                typeof operation.originDeviceId !== 'string' ||
                !('originSequence' in operation) ||
                typeof operation.originSequence !== 'number' ||
                operation.originSequence >
                  (prepared.manifest.exporterFrontier[
                    operation.originDeviceId
                  ] ?? 0)
              )
                throw new SyncPackageError(
                  'Operation lies beyond the package exporter frontier.'
                );
              const result = applyOperation(operation, tx);
              if (result === 'applied') applied++;
              else alreadyPresent++;
            });
            if (
              count !== prepared.manifest.operations.count ||
              byteLength !== prepared.manifest.operations.byteLength ||
              bytesToHex(digest.digest()) !==
                prepared.manifest.operations.sha256
            )
              throw new SyncPackageError(
                'Operations do not match package manifest.'
              );
            if (!frontierCovers(tx, prepared.manifest.exporterFrontier))
              throw new SyncPackageError(
                'Package is missing operations required by its exporter frontier.'
              );
            return { status: 'processed' as const, applied, alreadyPresent };
          }
        );
        const needed = findMissingLiveBlobHashes(database, isBlobAvailable);
        const blobs = await fixLiveAttachmentBlobs(
          needed,
          prepared,
          options,
          yieldToApp
        );
        return { packageId: prepared.manifest.packageId, operations, blobs };
      } finally {
        try {
          await prepared.cleanup();
        } catch (error) {
          console.error('Sync import temporary-file cleanup failed', error);
        }
      }
    });
  };
}
