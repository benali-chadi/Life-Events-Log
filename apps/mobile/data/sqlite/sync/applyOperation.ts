import type { SyncTransaction } from '../database';
import { validateOperation } from './validation/validateOperation';
import { applyDomainMutation } from './applyDomainMutation';
import {
  appendOperation,
  type AppendOperationDependencies,
} from './recording/appendOperation';
import { resolveOperation } from './resolution/resolveOperation';
import { refreshUpdatedAt } from './mutations/refreshUpdatedAt';

/** Applies and records one operation in the caller's transaction.
 * Errors must propagate out of that transaction for all-or-nothing behavior.
 * Dispatches entity, relation, attachment, and attachment-order operations.
 */
export function applyOperation(
  input: unknown,
  tx: SyncTransaction,
  dependencies?: AppendOperationDependencies
): 'applied' | 'already-applied' {
  const result = validateOperation(input, tx);
  if (result.status === 'already-applied') return 'already-applied';
  const { operation } = result;
  const winningFields = resolveOperation(operation, tx);
  if (winningFields.length) applyDomainMutation(operation, winningFields, tx);
  appendOperation(operation, tx, winningFields, dependencies);
  if (winningFields.length) refreshUpdatedAt(operation, tx);
  return 'applied';
}
