import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { hashAttachmentFile } from '../../../attachments/attachmentStorage';
import type { ArchiveService } from '../../../compression/ArchiveService';
import { MAX_MANIFEST_BYTES, MAX_OPERATION_LINE_BYTES } from '../packageLimits';
import { checkCancellation, validateManifest } from './validateSyncPackage';
import { SyncPackageError, type PreparedSyncPackage } from './types';
import { forEachOperationLine } from './readOperationLines';

function checkSize(file: File, expected: number): void {
  if (!file.exists || file.size !== expected)
    throw new SyncPackageError(
      'Extracted file length does not match manifest.'
    );
}

/** Native archive mechanics stay behind ArchiveService; only package rules live here. */
export async function openExpoSyncPackage(
  packageUri: string,
  localDeviceId: string,
  archive: ArchiveService,
  signal?: AbortSignal
): Promise<PreparedSyncPackage> {
  checkCancellation(signal);
  const workspace = new Directory(Paths.cache, `sync-import-${randomUUID()}`);
  const batch = new Directory(workspace, 'blobs');
  const cleanupBatch = () => {
    if (batch.exists) batch.delete();
  };
  const cleanup = () => {
    if (workspace.exists) workspace.delete();
  };
  try {
    workspace.create();
    const entries = await archive.list(packageUri);
    checkCancellation(signal);
    const inventory = new Map(
      entries.map((entry) => [entry.path, entry.uncompressedSize])
    );
    if (
      inventory.size !== entries.length ||
      entries.some(
        (entry) =>
          !Number.isSafeInteger(entry.uncompressedSize) ||
          entry.uncompressedSize < 0 ||
          (entry.path !== 'manifest.json' &&
            entry.path !== 'operations.jsonl' &&
            !/^[0-9a-f]{64}$/.test(entry.path))
      )
    )
      throw new SyncPackageError('Unexpected or duplicate archive entry.');
    const manifestSize = inventory.get('manifest.json');
    if (manifestSize === undefined || !inventory.has('operations.jsonl'))
      throw new SyncPackageError(
        'Package is missing a required archive entry.'
      );
    if (manifestSize > MAX_MANIFEST_BYTES)
      throw new SyncPackageError('Manifest exceeds size limit.');
    await archive.extract(packageUri, ['manifest.json'], workspace.uri, signal);
    checkCancellation(signal);
    const manifestFile = new File(workspace, 'manifest.json');
    checkSize(manifestFile, manifestSize);
    let raw: unknown;
    try {
      raw = JSON.parse(manifestFile.textSync());
    } catch {
      throw new SyncPackageError('Invalid manifest JSON.');
    }
    const manifest = validateManifest(raw, localDeviceId);
    if (inventory.get('operations.jsonl') !== manifest.operations.byteLength)
      throw new SyncPackageError(
        'Operations file length does not match manifest.'
      );
    if (
      entries.length !== manifest.blobs.length + 2 ||
      manifest.blobs.some(
        (blob) => inventory.get(blob.contentHash) !== blob.byteLength
      )
    )
      throw new SyncPackageError('Archive entries do not match manifest.');
    const operationsFile = new File(workspace, 'operations.jsonl');
    const blobSizes = new Map(
      manifest.blobs.map((blob) => [blob.contentHash, blob.byteLength])
    );
    let batchHashes = new Set<string>();
    return {
      manifest,
      async prepareOperations(prepareSignal) {
        await archive.extract(
          packageUri,
          ['operations.jsonl'],
          workspace.uri,
          prepareSignal
        );
        checkCancellation(prepareSignal);
        checkSize(operationsFile, manifest.operations.byteLength);
      },
      forEachOperationLine(visit) {
        checkSize(operationsFile, manifest.operations.byteLength);
        forEachOperationLine(operationsFile, MAX_OPERATION_LINE_BYTES, visit);
      },
      async prepareBlobBatch(hashes, repairSignal) {
        checkCancellation(repairSignal);
        cleanupBatch();
        batchHashes = new Set();
        if (!hashes.length) return;
        if (hashes.some((hash) => !blobSizes.has(hash)))
          throw new SyncPackageError('Requested blob is not in the manifest.');
        batch.create();
        try {
          await archive.extract(packageUri, hashes, batch.uri, repairSignal);
          checkCancellation(repairSignal);
          batchHashes = new Set(hashes);
        } catch (error) {
          try {
            cleanupBatch();
          } catch (cleanupError) {
            console.error('Failed batch cleanup failed', cleanupError);
          }
          throw error;
        }
      },
      async repairBlob(hash, repairSignal) {
        checkCancellation(repairSignal);
        if (!blobSizes.has(hash)) return 'missing';
        if (!batchHashes.has(hash))
          throw new SyncPackageError('Blob batch is not prepared.');
        const temporary = new File(batch, hash);
        let promoted = false;
        try {
          checkSize(temporary, blobSizes.get(hash)!);
          // Shared native full-file hash; cancellation waits for it to finish.
          const contentHash = await hashAttachmentFile(temporary);
          checkCancellation(repairSignal);
          if (contentHash !== hash) return 'failed';
          const destinationDirectory = new Directory(
            Paths.document,
            'attachments'
          );
          destinationDirectory.create({
            idempotent: true,
            intermediates: true,
          });
          const destination = new File(destinationDirectory, hash);
          if (!destination.exists) {
            temporary.move(destination);
            promoted = true;
          }
          return 'restored';
        } finally {
          if (!promoted && temporary.exists) temporary.delete();
        }
      },
      cleanup,
    };
  } catch (error) {
    try {
      cleanup();
    } catch (cleanupError) {
      console.error('Sync import temporary-file cleanup failed', cleanupError);
    }
    throw error;
  }
}
