import type { SyncTransaction } from '../../database';
import type { CreateOperationInput } from '../types';
import { validatePayload } from '../validation/validatePayload';
import { winningFieldsFor } from '../entityFields';
import { applyDomainMutation } from '../applyDomainMutation';
import { compactPendingOperation } from './compactPendingOperation';
import { cleanupDeletion } from './cleanupDeletion';
import { clearLocalConflicts } from './clearLocalConflicts';

/** Applies and compacts repository-local intent without sealing it.
 * The caller supplies a transaction and performs local domain checks within it.
 * Errors must propagate to roll back the transaction.
 */
export function applyPendingOperation(
  input: CreateOperationInput,
  tx: SyncTransaction
): void {
  validatePayload(input);
  applyDomainMutation(input, winningFieldsFor(input), tx);

  compactPendingOperation(input, tx);
  if (
    input.operationType === 'entity.delete' ||
    input.operationType === 'attachment.delete'
  ) {
    cleanupDeletion(input, tx);
  }
  clearLocalConflicts(input, tx);
}
