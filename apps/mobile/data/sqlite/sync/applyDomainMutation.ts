import type { SyncTransaction } from '../database';
import type { Operation, SyncFieldName } from './types';
import { createEntity, patchEntity, deleteEntity } from './mutations/entities';
import { mutateRelation } from './mutations/relations';

/** Dispatches prepared operations; does not validate, arbitrate, or record them.
 * Creation inserts a complete initial row. Patch/delete handlers apply only
 * the selected winning fields.
 */
export function applyDomainMutation(
  operation: Operation,
  winningFields: readonly SyncFieldName[],
  tx: SyncTransaction
): void {
  switch (operation.operationType) {
    case 'relation.add':
    case 'relation.remove':
      return mutateRelation(operation, winningFields, tx);
    case 'entity.create':
      return createEntity(operation, tx);
    case 'entity.patch':
      return patchEntity(operation, winningFields, tx);
    case 'entity.delete':
      return deleteEntity(operation, winningFields, tx);
  }
  throw new Error(
    `Domain mutation not implemented: ${operation.operationType}/${operation.entityType}.`
  );
}
