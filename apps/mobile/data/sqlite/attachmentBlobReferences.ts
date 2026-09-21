import { and, eq, isNull } from 'drizzle-orm';
import type { AppDatabase } from './database';
import { events, eventAttachments } from './schema';
import type { BlobCleanupReferences } from '../jobs/attachmentBlobCleanup/types';

export function createAttachmentBlobReferences(
  db: Pick<AppDatabase, 'selectDistinct'>
): BlobCleanupReferences {
  const active = and(
    isNull(eventAttachments.deletedAt),
    isNull(events.deletedAt)
  );
  return {
    liveContentHashes: () =>
      new Set(
        db
          .selectDistinct({ hash: eventAttachments.contentHash })
          .from(eventAttachments)
          .innerJoin(events, eq(events.id, eventAttachments.eventId))
          .where(active)
          .all()
          .map((row) => row.hash)
      ),
  };
}
