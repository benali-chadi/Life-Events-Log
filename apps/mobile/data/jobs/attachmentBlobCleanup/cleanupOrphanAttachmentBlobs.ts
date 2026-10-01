import type { CleanupOptions, CleanupResult } from './types';

/** Requires caller coordination preventing new blob references/imports for the
 * entire sweep. Cancellation alone does not provide that protection.
 * No database writes, hashing, recursive traversal, or blob-content reads.
 */
export async function cleanupOrphanAttachmentBlobs({
  references,
  storage,
  signal,
  batchSize = 50,
  yieldToApp = () => new Promise((resolve) => setTimeout(resolve, 0)),
}: CleanupOptions): Promise<CleanupResult> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new Error('Cleanup batch size must be a positive safe integer.');
  const result: CleanupResult = {
    scanned: 0,
    deleted: 0,
    failed: 0,
    cancelled: false,
  };
  if (signal?.aborted) return { ...result, cancelled: true };
  // Fail closed: DB/listing failures must never look like an empty live set.
  const live = references.liveContentHashes();
  const blobs = storage.listBlobs();
  for (let index = 0; index < blobs.length; index++) {
    if (signal?.aborted) return { ...result, cancelled: true };
    const hash = blobs[index]!;
    if (/^[0-9a-f]{64}$/.test(hash)) {
      result.scanned++;
      if (!live.has(hash)) {
        if (signal?.aborted) return { ...result, cancelled: true };
        try {
          if (storage.deleteBlob(hash)) result.deleted++;
        } catch {
          result.failed++;
        }
      }
    }
    if ((index + 1) % batchSize === 0 && index + 1 < blobs.length)
      await yieldToApp();
  }
  return result;
}
