import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../database';
import {
  categories,
  tags,
  people,
  locations,
  events,
  eventAttachments,
  syncPendingOperations,
} from '../schema';
import { createOperation } from '../sync/createOperation';
import { appendOperation } from '../sync/recording/appendOperation';
import { winningFieldsFor } from '../sync/entityFields';
import { pendingWhere } from '../sync/pending/store';
import type { CreateOperationInput } from '../sync/types';

const tables = {
  category: categories,
  tag: tags,
  person: people,
  location: locations,
  event: events,
  attachment: eventAttachments,
};

/** Test fixture only: record an existing row's creation without replaying it.
 * This is not pending-operation sealing and does not process dependencies.
 */
export function recordSealedCreation(
  database: AppDatabase,
  entityType: keyof typeof tables,
  entityId: string
): void {
  database.transaction((tx) => {
    const table = tables[entityType];
    const row = tx.select().from(table).where(eq(table.id, entityId)).get();
    if (!row) throw new Error('Missing fixture row.');
    const payload = Object.fromEntries(
      Object.entries(row).filter(
        ([key]) =>
          !['id', 'deletedAt', 'normalizedName', 'normalizedTitle'].includes(
            key
          )
      )
    );
    const operationType =
      entityType === 'attachment' ? 'attachment.create' : 'entity.create';
    const operation = createOperation(
      { operationType, entityType, entityId, payload } as CreateOperationInput,
      tx
    );
    appendOperation(operation, tx, winningFieldsFor(operation));
    tx.delete(syncPendingOperations)
      .where(pendingWhere(entityType, entityId, operationType))
      .run();
  });
}
