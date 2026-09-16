import { sql } from 'drizzle-orm';
import type { SyncTransaction } from '../../database';
import { eventTags, eventPeople } from '../../schema';
import { relationTarget, type RelationOperation } from '../relations';
import type { SyncFieldName } from '../types';
import { OperationValidationError } from '../OperationValidationError';

export function mutateRelation(
  operation: RelationOperation,
  winningFields: readonly SyncFieldName[],
  tx: SyncTransaction
): void {
  const { table, where } = relationTarget(operation);
  const existing = tx.select().from(table).where(where).get();
  const wins = winningFields.includes('deleted_at');
  const timestamp =
    operation.operationType === 'relation.add'
      ? operation.payload.updatedAt
      : operation.payload.deletedAt;
  const deletedAt =
    operation.operationType === 'relation.add'
      ? null
      : operation.payload.deletedAt;
  if (!existing) {
    if (operation.operationType !== 'relation.add' || !wins)
      throw new OperationValidationError(
        'Cannot mutate a missing relationship without a winning addition.'
      );
    if (operation.entityType === 'event_tag')
      tx.insert(eventTags)
        .values({ ...operation.payload, deletedAt: null })
        .run();
    else
      tx.insert(eventPeople)
        .values({ ...operation.payload, deletedAt: null })
        .run();
  } else {
    tx.update(table)
      .set({
        ...(wins ? { deletedAt } : {}),
        ...(operation.operationType === 'relation.add'
          ? {
              createdAt: sql`min(${table.createdAt}, ${operation.payload.createdAt})`,
            }
          : {}),
        updatedAt: sql`max(${table.updatedAt}, ${timestamp})`,
      })
      .where(where)
      .run();
  }
}
