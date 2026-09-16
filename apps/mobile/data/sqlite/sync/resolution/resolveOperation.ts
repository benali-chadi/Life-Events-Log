import type { SyncTransaction } from '../../database';
import type { Operation, SyncFieldName } from '../types';
import { resolveEntity } from './resolveEntity';
import { resolveRelation } from './relations';

/** Selects the resolver for an already validated operation. */
export function resolveOperation(
  operation: Operation,
  tx: SyncTransaction
): readonly SyncFieldName[] {
  switch (operation.operationType) {
    case 'entity.create':
    case 'entity.patch':
    case 'entity.delete':
      return resolveEntity(operation, tx);
    case 'relation.add':
    case 'relation.remove':
      return resolveRelation(operation, tx);
    default:
      throw new Error(
        `Resolution not implemented: ${operation.operationType}/${operation.entityType}.`
      );
  }
}
