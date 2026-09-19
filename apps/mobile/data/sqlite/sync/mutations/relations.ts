import type { SyncTransaction } from '../../database';
import { eventTags, eventPeople } from '../../schema';
import { relationTarget } from '../resolution/relations';
import type { CreateOperationInput, SyncFieldName } from '../types';
import { OperationValidationError } from '../validation/OperationValidationError';

export function mutateRelation(
  operation: Extract<
    CreateOperationInput,
    { operationType: 'relation.add' | 'relation.remove' }
  >,
  winningFields: readonly SyncFieldName[],
  tx: SyncTransaction
): void {
  if (!winningFields.includes('deleted_at')) return;
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
              createdAt: operation.payload.createdAt,
            }
          : {}),
        updatedAt: timestamp,
      })
      .where(where)
      .run();
  }
}
