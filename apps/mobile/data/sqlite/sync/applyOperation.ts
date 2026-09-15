import type { SyncTransaction } from '../database';
import { validateOperation } from './validateOperation';
import { applyDomainMutation } from './applyDomainMutation';
import {
  appendOperation,
  type AppendOperationDependencies,
} from './appendOperation';
import { winningFieldsFor } from './entityFields';

/** Applies and records one operation in the caller's transaction.
 * Errors must propagate out of that transaction for all-or-nothing behavior.
 * Entity create/patch/delete are supported; this is not a conflict-aware importer yet.
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
