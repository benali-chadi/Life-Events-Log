import { normalizeSearchText } from '@/data/repositories/metadataName';
import type { SyncTransaction } from '../../database';
import { events } from '../../schema';
import type { Operation } from '../types';

type EventCreateOperation = Extract<
  Operation,
  { operationType: 'entity.create'; entityType: 'event' }
>;

/** Applies prepared values only. Validation/arbitration belongs to the caller. */
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
