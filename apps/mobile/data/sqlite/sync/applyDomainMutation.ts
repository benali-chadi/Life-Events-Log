import type { SyncTransaction } from '../database';
import type { Operation, SyncFieldName } from './types';
import { createEvent } from './mutations/createEvent';

/** Dispatches prepared operations; does not validate, arbitrate, or record them.
 * Event creation inserts a complete initial row, so field filtering does not
 * apply to it. Other handlers will consume winningFields as they are added.
 */
export function applyDomainMutation(
  operation: Operation,
  winningFields: readonly SyncFieldName[],
  tx: SyncTransaction
): void {
  switch (operation.operationType) {
    case 'entity.create':
      if (operation.entityType === 'event') {
        createEvent(operation, tx);
        return;
      }
      break;
  }
  throw new Error(
    `Domain mutation not implemented: ${operation.operationType}/${operation.entityType}.`
  );
}
