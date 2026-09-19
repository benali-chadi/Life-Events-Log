import type { SyncTransaction } from '../../database';
import type { CreateOperationInput } from '../types';
import { validatePayload } from '../validation/validatePayload';
import { winningFieldsFor } from '../entityFields';
import { applyDomainMutation } from '../applyDomainMutation';
import { compactPendingOperation } from './compactPendingOperation';
import { cleanupDeletion } from './cleanupDeletion';

/** Work in progress: not wired to repositories; conflict cleanup is still pending.
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
  // TODO: Clear relevant local conflicts.
}
