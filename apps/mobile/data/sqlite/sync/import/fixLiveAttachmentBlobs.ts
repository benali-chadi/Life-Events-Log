import { and, eq, isNull } from 'drizzle-orm';
import type { AppDatabase } from '../../database';
import { eventAttachments, events } from '../../schema';
import type {
  PreparedSyncPackage,
  SyncImportOptions,
  SyncImportResult,
} from './types';

/** Only active attachments belonging to active events keep blobs live. */
export function findMissingLiveBlobHashes(
  database: AppDatabase,
  isAvailable: (hash: string) => boolean
): string[] {
  return database
    .selectDistinct({ hash: eventAttachments.contentHash })
    .from(eventAttachments)
    .innerJoin(events, eq(events.id, eventAttachments.eventId))
    .where(and(isNull(eventAttachments.deletedAt), isNull(events.deletedAt)))
    .all()
    .map((row) => row.hash)
    .filter((hash) => !isAvailable(hash));
}

export async function fixLiveAttachmentBlobs(
  hashes: readonly string[],
  prepared: PreparedSyncPackage,
  { signal, onProgress }: SyncImportOptions,
  yieldToApp: () => Promise<void>
): Promise<SyncImportResult['blobs']> {
  const result = { restored: 0, stillMissing: 0, failed: 0, cancelled: false };
  const packaged = new Set(
    prepared.manifest.blobs.map((blob) => blob.contentHash)
  );
  onProgress?.({
    phase: 'repairing-blobs',
    completed: 0,
    total: hashes.length,
    cancellable: true,
  });
  for (let index = 0; index < hashes.length; index++) {
    if (signal?.aborted) return { ...result, cancelled: true };
    const hash = hashes[index]!;
    if (!packaged.has(hash)) result.stillMissing++;
    else {
      try {
        const outcome = await prepared.repairBlob(hash, signal);
        if (outcome === 'restored') result.restored++;
        else if (outcome === 'missing') result.stillMissing++;
        else result.failed++;
      } catch (error) {
        if (
          signal?.aborted &&
          error instanceof Error &&
          error.name === 'AbortError'
        )
          return { ...result, cancelled: true };
        result.failed++;
      }
    }
    onProgress?.({
      phase: 'repairing-blobs',
      completed: index + 1,
      total: hashes.length,
      cancellable: true,
    });
    await yieldToApp();
  }
  return result;
}
