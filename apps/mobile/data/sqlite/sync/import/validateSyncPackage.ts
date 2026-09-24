import type { AppDatabase } from '../../database';
import { syncLocalState } from '../../schema';
import type { SyncPackageManifest } from '../export/types';
import type { PreparedSyncPackage } from './types';
import { SyncPackageError } from './types';

const hashPattern = /^[0-9a-f]{64}$/;
const uuidPattern = /^[a-zA-Z0-9_-]+$/;

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new SyncPackageError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function nonempty(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim())
    throw new SyncPackageError(`${label} must be a nonempty string.`);
}
function count(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new SyncPackageError(`${label} must be a nonnegative safe integer.`);
}
function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string
): void {
  if (
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    throw new SyncPackageError(`${label} has missing or unsupported fields.`);
}

export function validateManifest(
  input: unknown,
  localDeviceId: string
): SyncPackageManifest {
  const manifest = object(input, 'manifest');
  exactKeys(
    manifest,
    [
      'formatVersion',
      'operationSchemaVersion',
      'packageId',
      'createdByDeviceId',
      'createdAt',
      'exporterFrontier',
      'intendedRecipientDeviceId',
      'baseFrontier',
      'operations',
      'blobs',
    ],
    'manifest'
  );
  if (manifest.formatVersion !== 1)
    throw new SyncPackageError('Unsupported package format version.');
  if (manifest.operationSchemaVersion !== 1)
    throw new SyncPackageError('Unsupported operation schema version.');
  nonempty(manifest.packageId, 'packageId');
  if (!uuidPattern.test(manifest.packageId))
    throw new SyncPackageError('Invalid packageId.');
  nonempty(manifest.createdByDeviceId, 'createdByDeviceId');
  nonempty(manifest.createdAt, 'createdAt');
  if (
    typeof manifest.intendedRecipientDeviceId !== 'string' &&
    manifest.intendedRecipientDeviceId !== null
  )
    throw new SyncPackageError('Invalid intended recipient.');
  if (
    manifest.intendedRecipientDeviceId !== null &&
    manifest.intendedRecipientDeviceId !== localDeviceId
  )
    throw new SyncPackageError('Package is intended for a different device.');
  if (manifest.baseFrontier !== null)
    throw new SyncPackageError('Incremental packages are not supported yet.');
  const frontier = object(manifest.exporterFrontier, 'exporterFrontier');
  for (const [origin, sequence] of Object.entries(frontier)) {
    nonempty(origin, 'frontier origin');
    count(sequence, `frontier sequence for ${origin}`);
  }
  const operations = object(manifest.operations, 'operations');
  exactKeys(
    operations,
    ['path', 'count', 'byteLength', 'sha256'],
    'operations'
  );
  if (operations.path !== 'operations.jsonl')
    throw new SyncPackageError('Invalid operations path.');
  count(operations.count, 'operations count');
  count(operations.byteLength, 'operations byte length');
  if (
    typeof operations.sha256 !== 'string' ||
    !hashPattern.test(operations.sha256)
  )
    throw new SyncPackageError('Invalid operations digest.');
  if (!Array.isArray(manifest.blobs))
    throw new SyncPackageError('Blobs must be a list.');
  const seen = new Set<string>();
  for (const raw of manifest.blobs) {
    const blob = object(raw, 'blob');
    exactKeys(blob, ['contentHash', 'byteLength'], 'blob');
    if (
      typeof blob.contentHash !== 'string' ||
      !hashPattern.test(blob.contentHash) ||
      seen.has(blob.contentHash)
    )
      throw new SyncPackageError('Invalid or duplicate blob hash.');
    count(blob.byteLength, 'blob byte length');
    seen.add(blob.contentHash);
  }
  return manifest as SyncPackageManifest;
}

export function checkCancellation(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Sync import cancelled.');
  error.name = 'AbortError';
  throw error;
}

/** Structural validation only: operation digest and needed blob bytes come later. */
export async function validateSyncPackage(
  packageUri: string,
  database: AppDatabase,
  openPackage: (
    uri: string,
    signal?: AbortSignal
  ) => Promise<PreparedSyncPackage>,
  signal?: AbortSignal
): Promise<PreparedSyncPackage> {
  checkCancellation(signal);
  const local = database.select().from(syncLocalState).get();
  if (!local)
    throw new SyncPackageError('Sync local state is not initialized.');
  const prepared = await openPackage(packageUri, signal);
  try {
    prepared.manifest = validateManifest(prepared.manifest, local.deviceId);
    checkCancellation(signal);
    return prepared;
  } catch (error) {
    await prepared.cleanup();
    throw error;
  }
}
