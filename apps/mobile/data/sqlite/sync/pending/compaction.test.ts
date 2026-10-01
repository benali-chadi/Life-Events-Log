import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import type { AppDatabase } from '../../database';
import {
  events,
  tags,
  categories,
  eventTags,
  eventAttachments,
  syncPendingOperations,
  syncOperations,
  syncFieldVersions,
} from '../../schema';
import { createTestDatabase } from '../../testing/createTestDatabase';
import type { CreateOperationInput } from '../types';
import { createOperation } from '../createOperation';
import { applyOperation } from '../applyOperation';
import { applyPendingOperation } from './applyPendingOperation';

let sqlite: Database;
let db: AppDatabase;
const at = '2026-09-19T00:00:00.000Z';
const later = '2026-09-20T00:00:00.000Z';
const future = '2099-01-01T00:00:00.000Z';
const event: CreateOperationInput = {
  operationType: 'entity.create',
  entityType: 'event',
  entityId: 'event',
  payload: {
    title: 'Original',
    date: '2026-09-19',
    time: null,
    significance: 'ordinary',
    notes: '',
    categoryId: null,
    locationId: null,
    createdAt: at,
    updatedAt: at,
  },
};
const tag: CreateOperationInput = {
  operationType: 'entity.create',
  entityType: 'tag',
  entityId: 'tag',
  payload: { name: 'Travel', createdAt: at, updatedAt: at },
};
const add: CreateOperationInput = {
  operationType: 'relation.add',
  entityType: 'event_tag',
  entityId: JSON.stringify(['event', 'tag']),
  payload: { eventId: 'event', tagId: 'tag', createdAt: at, updatedAt: at },
};
const remove: CreateOperationInput = {
  operationType: 'relation.remove',
  entityType: 'event_tag',
  entityId: add.entityId,
  payload: { eventId: 'event', tagId: 'tag', deletedAt: later },
};
const attachment: CreateOperationInput = {
  operationType: 'attachment.create',
  entityType: 'attachment',
  entityId: 'image',
  payload: {
    eventId: 'event',
    contentHash: 'a'.repeat(64),
    filename: 'a.jpg',
    mimeType: 'image/jpeg',
    width: null,
    height: null,
    fileSize: 1,
    sortOrder: 0,
    createdAt: at,
    updatedAt: at,
  },
};
const pending = (input: CreateOperationInput) =>
  db.transaction((tx) => applyPendingOperation(input, tx));
const seal = (input: CreateOperationInput) =>
  db.transaction((tx) => applyOperation(createOperation(input, tx), tx));
const rows = () => db.select().from(syncPendingOperations).all();
beforeEach(async () => {
  ({ sqlite, database: db } = await createTestDatabase({
    initializeSyncState: true,
  }));
});
afterEach(() => sqlite.close());

it('combines patch fields with latest assignments and restores sealed values on deletion', () => {
  seal(event);
  seal({
    operationType: 'entity.patch',
    entityType: 'event',
    entityId: 'event',
    payload: { changes: { title: 'Sealed' }, updatedAt: later },
  });
  const history = db.select().from(syncOperations).all();
  const versions = db.select().from(syncFieldVersions).all();
  pending({
    operationType: 'entity.patch',
    entityType: 'event',
    entityId: 'event',
    payload: {
      changes: { title: 'Pending', notes: 'Note' },
      updatedAt: future,
    },
  });
  pending({
    operationType: 'entity.patch',
    entityType: 'event',
    entityId: 'event',
    payload: { changes: { title: 'Latest' }, updatedAt: at },
  });
  expect(rows()).toHaveLength(1);
  expect(rows()[0]?.payload).toEqual({
    changes: { title: 'Latest', notes: 'Note' },
    updatedAt: at,
  });
  pending({
    operationType: 'entity.delete',
    entityType: 'event',
    entityId: 'event',
    payload: { deletedAt: at },
  });
  expect(rows().map((row) => row.operationType)).toEqual(['entity.delete']);
  expect(db.select().from(events).get()).toMatchObject({
    title: 'Sealed',
    normalizedTitle: 'sealed',
    notes: '',
    deletedAt: at,
    updatedAt: later,
  });
  expect(db.select().from(syncOperations).all()).toEqual(history);
  expect(db.select().from(syncFieldVersions).all()).toEqual(versions);
});

it('keeps an unsealed relation add before remove and collapses repeated toggles', () => {
  seal(event);
  seal(tag);
  pending(add);
  pending(remove);
  expect(
    rows()
      .map((row) => row.operationType)
      .sort()
  ).toEqual(['relation.add', 'relation.remove']);
  pending(add);
  expect(rows().map((row) => row.operationType)).toEqual(['relation.add']);
  expect(db.select().from(eventTags).get()?.deletedAt).toBeNull();
  pending(remove);
  expect(rows()).toHaveLength(2);
});

it('keeps only the final membership action for a sealed relation', () => {
  seal(event);
  seal(tag);
  seal(add);
  pending(remove);
  pending(add);
  pending(remove);
  expect(rows().map((row) => row.operationType)).toEqual(['relation.remove']);
});

it('cancels unsealed events with attachments, relations and reorder payloads', () => {
  seal(tag);
  pending(event);
  pending(add);
  pending(attachment);
  pending({
    operationType: 'event.attachment.reorder',
    entityType: 'event',
    entityId: 'event',
    payload: { orderedAttachmentIds: ['image'], updatedAt: later },
  });
  pending({
    operationType: 'entity.delete',
    entityType: 'event',
    entityId: 'event',
    payload: { deletedAt: later },
  });
  expect(rows()).toEqual([]);
  expect(db.select().from(events).all()).toEqual([]);
  expect(db.select().from(eventAttachments).all()).toEqual([]);
  expect(db.select().from(eventTags).all()).toEqual([]);
  expect(db.select().from(tags).all()).toHaveLength(1);
});

it('removes canceled attachments from the single latest pending reorder', () => {
  seal(event);
  pending(attachment);
  const reorder: CreateOperationInput = {
    operationType: 'event.attachment.reorder',
    entityType: 'event',
    entityId: 'event',
    payload: { orderedAttachmentIds: ['image'], updatedAt: at },
  };
  pending(reorder);
  pending({ ...reorder, payload: { ...reorder.payload, updatedAt: later } });
  pending({
    operationType: 'attachment.delete',
    entityType: 'attachment',
    entityId: 'image',
    payload: { deletedAt: later },
  });
  expect(rows()).toEqual([
    { ...reorder, payload: { orderedAttachmentIds: [], updatedAt: later } },
  ]);
  expect(db.select().from(eventAttachments).all()).toEqual([]);
});

it('clears canceled metadata from event rows and pending event patches', () => {
  seal(event);
  pending({
    operationType: 'entity.create',
    entityType: 'category',
    entityId: 'category',
    payload: { name: 'Travel', color: 'blue', createdAt: at, updatedAt: at },
  });
  pending({
    operationType: 'entity.patch',
    entityType: 'event',
    entityId: 'event',
    payload: { changes: { categoryId: 'category' }, updatedAt: later },
  });
  pending({
    operationType: 'entity.delete',
    entityType: 'category',
    entityId: 'category',
    payload: { deletedAt: later },
  });
  expect(db.select().from(categories).all()).toEqual([]);
  expect(db.select().from(events).get()?.categoryId).toBeNull();
  expect(rows()[0]?.payload).toEqual({
    changes: { categoryId: null },
    updatedAt: later,
  });
});

it('removes relations when canceling an unsealed tag but retains the event', () => {
  seal(event);
  pending(tag);
  pending(add);
  pending(remove);
  pending({
    operationType: 'entity.delete',
    entityType: 'tag',
    entityId: 'tag',
    payload: { deletedAt: later },
  });
  expect(rows()).toEqual([]);
  expect(db.select().from(tags).all()).toEqual([]);
  expect(db.select().from(eventTags).all()).toEqual([]);
  expect(db.select().from(events).all()).toHaveLength(1);
});

it('keeps sealed attachments and their creation timestamp baseline on deletion', () => {
  seal(event);
  seal(attachment);
  pending({
    operationType: 'attachment.delete',
    entityType: 'attachment',
    entityId: 'image',
    payload: { deletedAt: later },
  });
  expect(db.select().from(eventAttachments).get()).toMatchObject({
    deletedAt: later,
    updatedAt: later,
  });
  expect(rows().map((row) => row.operationType)).toEqual(['attachment.delete']);
});

it('updates visible positions when cancellation shortens a pending reorder', () => {
  seal(event);
  pending(attachment);
  pending({ ...attachment, entityId: 'second' });
  pending({
    operationType: 'event.attachment.reorder',
    entityType: 'event',
    entityId: 'event',
    payload: { orderedAttachmentIds: ['image', 'second'], updatedAt: later },
  });
  pending({
    operationType: 'attachment.delete',
    entityType: 'attachment',
    entityId: 'image',
    payload: { deletedAt: later },
  });
  expect(db.select().from(eventAttachments).get()).toMatchObject({
    id: 'second',
    sortOrder: 0,
  });
});

it('rolls back deletion if creation history cannot be established', () => {
  db.insert(tags)
    .values({
      id: 'legacy',
      name: 'Legacy',
      normalizedName: 'legacy',
      createdAt: at,
      updatedAt: at,
    })
    .run();
  expect(() =>
    pending({
      operationType: 'entity.delete',
      entityType: 'tag',
      entityId: 'legacy',
      payload: { deletedAt: later },
    })
  ).toThrow('creation history');
  expect(db.select().from(tags).get()?.deletedAt).toBeNull();
  expect(rows()).toEqual([]);
});
