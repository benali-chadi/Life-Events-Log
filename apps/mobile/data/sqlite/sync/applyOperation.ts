import type { SyncTransaction } from '../database';
import { validateOperation } from './validateOperation';
import { applyDomainMutation } from './applyDomainMutation';
import {
  appendOperation,
  type AppendOperationDependencies,
} from './appendOperation';
import type {
  DomainFieldNamesByEntity,
  Operation,
  SyncFieldName,
} from './types';

const eventCreationFields = [
  'title',
  'date',
  'time',
  'significance',
  'category_id',
  'location_id',
  'notes',
  'deleted_at',
] as const satisfies readonly DomainFieldNamesByEntity['event'][];

/** Temporary selection for supported mutations: no conflict resolution yet. */
function winningFieldsFor(operation: Operation): readonly SyncFieldName[] {
  if (
    operation.operationType === 'entity.create' &&
    operation.entityType === 'event'
  )
    return eventCreationFields;
  throw new Error(
    `Winning fields not implemented: ${operation.operationType}/${operation.entityType}.`
  );
}

/** Applies and records one operation in the caller's transaction.
 * Errors must propagate out of that transaction for all-or-nothing behavior.
 * Only event creation is supported; this is not a conflict-aware importer yet.
 */
export function applyOperation(
  input: unknown,
  tx: SyncTransaction,
  dependencies?: AppendOperationDependencies
): 'applied' | 'already-applied' {
  const result = validateOperation(input, tx);
  if (result.status === 'already-applied') return 'already-applied';
  const { operation } = result;
  const winningFields = winningFieldsFor(operation);
  applyDomainMutation(operation, winningFields, tx);
  appendOperation(operation, tx, winningFields, dependencies);
  return 'applied';
}
