import { normalizeSearchText } from '@/data/repositories/metadataName';
import type { SyncTransaction } from '../../database';
import { events } from '../../schema';
import type { Operation } from '../types';

type EventCreateOperation = Extract<
  Operation,
  { operationType: 'entity.create'; entityType: 'event' }
>;

/** Applies prepared values only. Validation/arbitration belongs to the caller.
 * The narrow input also lets the repository reuse this writer while its
 * remaining mutations have not yet been converted into operations.
 */
export function createEvent(
  operation: Pick<EventCreateOperation, 'entityId' | 'payload'>,
  tx: SyncTransaction
): void {
  tx.insert(events)
    .values({
      ...operation.payload,
      id: operation.entityId,
      deletedAt: null,
      normalizedTitle: normalizeSearchText(operation.payload.title),
    })
    .run();
}
