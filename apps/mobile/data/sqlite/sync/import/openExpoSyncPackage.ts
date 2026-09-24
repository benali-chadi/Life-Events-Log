import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { openZipArchive, ZIP32_LIMIT } from '../../../compression/zip';
import { MAX_MANIFEST_BYTES, MAX_OPERATION_LINE_BYTES } from '../packageLimits';
import { checkCancellation, validateManifest } from './validateSyncPackage';
import { SyncPackageError, type PreparedSyncPackage } from './types';

const hashPattern = /^[0-9a-f]{64}$/;

/** Apply LEL package rules to a generic random-access ZIP reader. */
export async function openExpoSyncPackage(
  packageUri: string,
  localDeviceId: string,
  signal?: AbortSignal
): Promise<PreparedSyncPackage> {
  checkCancellation(signal);
  const zip = openZipArchive(packageUri);
  try {
    for (const name of zip.entries.keys()) {
      if (
        name !== 'manifest.json' &&
        name !== 'operations.jsonl' &&
        !/^blobs\/[0-9a-f]{64}$/.test(name)
      )
        throw new SyncPackageError('Unexpected ZIP entry.');
    }
    if (
      !zip.entries.has('manifest.json') ||
      !zip.entries.has('operations.jsonl')
    )
      throw new SyncPackageError('Package is missing a required ZIP entry.');
    const manifestText = zip.readText('manifest.json', MAX_MANIFEST_BYTES);
    let raw: unknown;
    try {
      raw = JSON.parse(manifestText);
    } catch {
      throw new SyncPackageError('Invalid manifest JSON.');
    }
    const manifest = validateManifest(raw, localDeviceId);
    const manifestEntry = zip.entries.get('manifest.json')!;
    const operationsEntry = zip.entries.get('operations.jsonl')!;
    if (
      manifestEntry.method !== 'deflate' ||
      operationsEntry.method !== 'deflate'
    )
      throw new SyncPackageError('Package JSON entries must use DEFLATE.');
    if (
      operationsEntry.byteLength !== manifest.operations.byteLength ||
      operationsEntry.byteLength >= ZIP32_LIMIT
    )
      throw new SyncPackageError(
        'Operations file length does not match manifest.'
      );
    if (zip.entries.size !== manifest.blobs.length + 2)
      throw new SyncPackageError('ZIP entries do not match manifest.');
    for (const blob of manifest.blobs) {
      if (!hashPattern.test(blob.contentHash))
        throw new SyncPackageError('Invalid blob hash.');
      const entry = zip.entries.get(`blobs/${blob.contentHash}`);
      if (
        !entry ||
        entry.method !== 'store' ||
        entry.byteLength !== blob.byteLength
      )
        throw new SyncPackageError('Blob entry does not match manifest.');
    }
    checkCancellation(signal);
    return {
      manifest,
      forEachOperationLine(visit) {
        zip.forEachLine(
          'operations.jsonl',
          ZIP32_LIMIT - 1,
          MAX_OPERATION_LINE_BYTES,
          visit
        );
      },
      async repairBlob(hash, repairSignal) {
        const name = `blobs/${hash}`;
        if (!zip.entries.has(name)) return 'missing';
        const destinationDirectory = new Directory(
          Paths.document,
          'attachments'
        );
        destinationDirectory.create({ idempotent: true, intermediates: true });
        const destination = new File(destinationDirectory, hash);
        if (destination.exists) return 'restored';
        const staging = new Directory(Paths.cache, 'sync-import-blobs');
        staging.create({ idempotent: true, intermediates: true });
        const temporary = new File(staging, randomUUID());
        let promoted = false;
        try {
          temporary.create();
          const output = temporary.open();
          const digest = sha256.create();
          try {
            await zip.copyStoredEntry(
              name,
              (bytes) => {
                digest.update(bytes);
                output.writeBytes(bytes);
              },
              repairSignal
            );
          } finally {
            output.close();
          }
          if (bytesToHex(digest.digest()) !== hash) return 'failed';
          if (!destination.exists) {
            temporary.move(destination);
            promoted = true;
          }
          return 'restored';
        } finally {
          if (!promoted && temporary.exists) temporary.delete();
        }
      },
      cleanup() {
        zip.close();
      },
    };
  } catch (error) {
    zip.close();
    throw error;
  }
}
