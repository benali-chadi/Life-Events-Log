import { and, eq } from 'drizzle-orm';
import type { SyncTransaction } from '../../database';
import {
  categories,
  events,
  tags,
  people,
  locations,
  eventAttachments,
  eventTags,
  eventPeople,
  syncOperations,
  syncFieldVersions,
  syncPendingOperations,
} from '../../schema';
import type { PendingOperation, Operation, SyncEntityType } from '../types';
import { entityFields } from '../entityFields';
import { applyDomainMutation } from '../applyDomainMutation';
import { normalizeSearchText } from '@/data/repositories/metadataName';
import { getPending, hasHistory, pendingWhere, putPending } from './store';

type Deletion = Extract<
  PendingOperation,
  { operationType: 'entity.delete' | 'attachment.delete' }
>;
type RestorableFieldWinner = Extract<
  Operation,
  { operationType: 'entity.create' | 'entity.patch' | 'attachment.create' }
>;
const tables = {
  event: events,
  category: categories,
  tag: tags,
  person: people,
  location: locations,
  attachment: eventAttachments,
};

function forget(type: SyncEntityType, id: string, tx: SyncTransaction) {
  tx.delete(syncPendingOperations).where(pendingWhere(type, id)).run();
}

/** Remove only identities that never entered immutable history. Never delete blobs. */
function removeUnsealed(
  type: keyof typeof tables,
  id: string,
  tx: SyncTransaction
): void {
  const creationType =
    type === 'attachment' ? 'attachment.create' : 'entity.create';
  if (hasHistory(type, id, creationType, tx))
    throw new Error('Cannot remove an operation-backed identity.');
  if (type === 'event') {
    for (const attachment of tx
      .select()
      .from(eventAttachments)
      .where(eq(eventAttachments.eventId, id))
      .all()) {
      removeUnsealed('attachment', attachment.id, tx);
    }
  }
  if (type === 'event' || type === 'tag') {
    const where =
      type === 'event' ? eq(eventTags.eventId, id) : eq(eventTags.tagId, id);
    for (const row of tx.select().from(eventTags).where(where).all()) {
      const key = JSON.stringify([row.eventId, row.tagId]);
      if (hasHistory('event_tag', key, 'relation.add', tx))
        throw new Error('Cannot remove a sealed relation reference.');
      forget('event_tag', key, tx);
    }
    tx.delete(eventTags).where(where).run();
  }
  if (type === 'event' || type === 'person') {
    const where =
      type === 'event'
        ? eq(eventPeople.eventId, id)
        : eq(eventPeople.personId, id);
    for (const row of tx.select().from(eventPeople).where(where).all()) {
      const key = JSON.stringify([row.eventId, row.personId]);
      if (hasHistory('event_person', key, 'relation.add', tx))
        throw new Error('Cannot remove a sealed relation reference.');
      forget('event_person', key, tx);
    }
    tx.delete(eventPeople).where(where).run();
  }
  // Rewrite pending references too, including patches currently hidden by deletion.
  for (const pending of tx
    .select()
    .from(syncPendingOperations)
    .all() as PendingOperation[]) {
    if (
      type === 'attachment' &&
      pending.operationType === 'event.attachment.reorder' &&
      pending.payload.orderedAttachmentIds.includes(id)
    ) {
      const rewritten: Extract<
        PendingOperation,
        { operationType: 'event.attachment.reorder' }
      > = {
        ...pending,
        payload: {
          ...pending.payload,
          orderedAttachmentIds: pending.payload.orderedAttachmentIds.filter(
            (value) => value !== id
          ),
        },
      };
      putPending(rewritten, tx);
      // Sealing does not replay mutations: keep the local order consistent with
      // the shortened payload now, not only after a future import.
      applyDomainMutation(rewritten, ['attachment_order'], tx);
    }
    if (
      (type === 'category' || type === 'location') &&
      pending.entityType === 'event'
    ) {
      const key = type === 'category' ? 'categoryId' : 'locationId';
      if (
        pending.operationType === 'entity.create' &&
        pending.payload[key] === id
      ) {
        putPending(
          { ...pending, payload: { ...pending.payload, [key]: null } },
          tx
        );
      } else if (
        pending.operationType === 'entity.patch' &&
        pending.payload.changes[key] === id
      ) {
        putPending(
          {
            ...pending,
            payload: {
              ...pending.payload,
              changes: { ...pending.payload.changes, [key]: null },
            },
          },
          tx
        );
      }
    }
  }
  if (type === 'category')
    tx.update(events)
      .set({ categoryId: null })
      .where(eq(events.categoryId, id))
      .run();
  if (type === 'location')
    tx.update(events)
      .set({ locationId: null })
      .where(eq(events.locationId, id))
      .run();
  forget(type, id, tx);
  const table = tables[type];
  tx.delete(table).where(eq(table.id, id)).run();
}

function restoreSealed(input: Deletion, tx: SyncTransaction): void {
  const table = tables[input.entityType];
  const row = tx.select().from(table).where(eq(table.id, input.entityId)).get();
  if (!row) throw new Error('Deletion target is missing.');
  const versions = tx
    .select()
    .from(syncFieldVersions)
    .where(
      and(
        eq(syncFieldVersions.entityType, input.entityType),
        eq(syncFieldVersions.entityId, input.entityId)
      )
    )
    .all();
  const restored: Record<string, unknown> = {};
  let updatedAt =
    row.createdAt > input.payload.deletedAt
      ? row.createdAt
      : input.payload.deletedAt;
  for (const version of versions) {
    // Ordering is separate; the pending delete replaces the deleted_at winner.
    if (
      version.fieldName === 'attachment_order' ||
      version.fieldName === 'deleted_at'
    )
      continue;
    const winner = tx
      .select()
      .from(syncOperations)
      .where(
        and(
          eq(syncOperations.originDeviceId, version.winnerDeviceId),
          eq(syncOperations.originSequence, version.winnerSequence)
        )
      )
      // Remaining entity/attachment fields are established by creates or patches.
      .get() as RestorableFieldWinner | undefined;
    if (!winner)
      throw new Error('Sealed field winner is missing from history.');
    const timestamp = winner.payload.updatedAt;
    if (timestamp > updatedAt) updatedAt = timestamp;
    if (input.entityType !== 'attachment') {
      const key = Object.entries(entityFields[input.entityType]).find(
        ([, field]) => field === version.fieldName
      )?.[0];
      const values =
        winner.operationType === 'entity.patch'
          ? winner.payload.changes
          : winner.payload;
      if (!key || !Object.hasOwn(values, key))
        throw new Error('Invalid sealed field history.');
      restored[key] = (values as Record<string, unknown>)[key];
    }
  }
  const patch = getPending(input, 'entity.patch', tx);
  if (
    patch?.operationType === 'entity.patch' &&
    Object.keys(patch.payload.changes).some(
      (key) => !Object.hasOwn(restored, key)
    )
  ) {
    throw new Error(
      'Cannot restore pending changes without sealed field history.'
    );
  }
  if (typeof restored.name === 'string')
    restored.normalizedName = normalizeSearchText(restored.name);
  if (typeof restored.title === 'string')
    restored.normalizedTitle = normalizeSearchText(restored.title);
  tx.update(table)
    .set({ ...restored, updatedAt, deletedAt: input.payload.deletedAt })
    .where(eq(table.id, input.entityId))
    .run();
  tx.delete(syncPendingOperations)
    .where(pendingWhere(input.entityType, input.entityId, 'entity.patch'))
    .run();
}

export function cleanupDeletion(input: Deletion, tx: SyncTransaction): void {
  const creationType =
    input.operationType === 'attachment.delete'
      ? 'attachment.create'
      : 'entity.create';
  if (getPending(input, creationType, tx))
    removeUnsealed(input.entityType, input.entityId, tx);
  else {
    if (!hasHistory(input.entityType, input.entityId, creationType, tx))
      throw new Error('Deletion requires pending or sealed creation history.');
    restoreSealed(input, tx);
  }
}
