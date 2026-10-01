import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import type { AppDatabase } from '../../database';
import {
  events,
  tags,
  eventTags,
  eventAttachments,
  syncPendingOperations,
  syncOperations,
  syncFieldVersions,
  syncFrontiers,
  syncLocalState,
} from '../../schema';
import { createTestDatabase } from '../../testing/createTestDatabase';
import { applyPendingOperation } from './applyPendingOperation';
import { sealPendingOperations } from './sealPendingOperations';
import { orderPendingOperations } from './orderPendingOperations';
import { applyOperation } from '../applyOperation';
import { hashOperationContent } from '../utils/hashOperationContent';
import type { PendingOperation } from '../types';

let sqlite: Database;
let db: AppDatabase;
const at = '2026-09-21T15:00:00.000Z';
const earlier = '2026-09-21T14:00:00.000Z';
const tag: PendingOperation = {
  operationType: 'entity.create',
  entityType: 'tag',
  entityId: 'tag',
  payload: { name: 'Travel', createdAt: earlier, updatedAt: at },
};
const event: PendingOperation = {
  operationType: 'entity.create',
  entityType: 'event',
  entityId: 'event',
  payload: {
    title: 'Title',
    date: '2026-09-21',
    time: null,
    significance: 'ordinary',
    notes: '',
    categoryId: null,
    locationId: null,
    createdAt: earlier,
    updatedAt: at,
  },
};
const image: PendingOperation = {
  operationType: 'attachment.create',
  entityType: 'attachment',
  entityId: 'image',
  payload: {
    eventId: 'event',
    filename: 'a.jpg',
    contentHash: 'a'.repeat(64),
    mimeType: null,
    width: null,
    height: null,
    fileSize: 1,
    sortOrder: 0,
    createdAt: earlier,
    updatedAt: at,
  },
};
const add: PendingOperation = {
  operationType: 'relation.add',
  entityType: 'event_tag',
  entityId: JSON.stringify(['event', 'tag']),
  payload: {
    eventId: 'event',
    tagId: 'tag',
    createdAt: earlier,
    updatedAt: at,
  },
};
const remove: PendingOperation = {
  operationType: 'relation.remove',
  entityType: 'event_tag',
  entityId: add.entityId,
  payload: { eventId: 'event', tagId: 'tag', deletedAt: at },
};
const reorder: PendingOperation = {
  operationType: 'event.attachment.reorder',
  entityType: 'event',
  entityId: 'event',
  payload: { orderedAttachmentIds: ['image'], updatedAt: at },
};
const pending = (input: PendingOperation) =>
  db.transaction((tx) => applyPendingOperation(input, tx));
const seal = () =>
  db.transaction((tx) => sealPendingOperations(tx, { now: () => at }));
beforeEach(async () => {
  ({ sqlite, database: db } = await createTestDatabase({
    initializeSyncState: true,
  }));
});
afterEach(() => sqlite.close());

it('orders dependencies deterministically without changing the source array', () => {
  const patch: PendingOperation = {
    operationType: 'entity.patch',
    entityType: 'event',
    entityId: 'event',
    payload: { changes: { notes: 'note' }, updatedAt: at },
  };
  const deletion: PendingOperation = {
    operationType: 'entity.delete',
    entityType: 'event',
    entityId: 'event',
    payload: { deletedAt: at },
  };
  const otherTag: PendingOperation = { ...tag, entityId: 'aaa' };
  const source = [
    deletion,
    remove,
    reorder,
    patch,
    image,
    event,
    tag,
    add,
    otherTag,
  ];
  const copy = [...source];
  const expected = [
    otherTag,
    tag,
    event,
    image,
    patch,
    add,
    remove,
    reorder,
    deletion,
  ];
  expect(orderPendingOperations(source)).toEqual(expected);
  expect(orderPendingOperations([...source].reverse())).toEqual(expected);
  expect(source).toEqual(copy);
});

it('seals a causal chain without replaying mutations and replays successfully on another replica', async () => {
  for (const input of [event, image, tag, add, remove, reorder]) pending(input);
  const before = db.select().from(events).all();
  const operations = seal();
  expect(operations.map((op) => op.operationType)).toEqual([
    'entity.create',
    'entity.create',
    'attachment.create',
    'relation.add',
    'relation.remove',
    'event.attachment.reorder',
  ]);
  operations.forEach((op, index) => {
    expect(op.originSequence).toBe(index + 1);
    expect(op.lamport).toBe(index + 1);
    expect(op.causalContext['test-device'] ?? 0).toBe(index);
    expect(op.operationHash).toBe(hashOperationContent(op));
  });
  expect(db.select().from(events).all()).toEqual(before);
  expect(db.select().from(syncPendingOperations).all()).toEqual([]);
  expect(seal()).toEqual([]);
  expect(db.select().from(syncOperations).all()).toHaveLength(6);
  const remote = await createTestDatabase({ initializeSyncState: true });
  try {
    remote.database.update(syncLocalState).set({ deviceId: 'remote' }).run();
    remote.database.transaction((tx) =>
      operations.forEach((op) => applyOperation(op, tx))
    );
    for (const table of [
      events,
      tags,
      eventTags,
      eventAttachments,
      syncFieldVersions,
      syncFrontiers,
    ]) {
      expect(remote.database.select().from(table).all()).toEqual(
        db.select().from(table).all()
      );
    }
  } finally {
    remote.sqlite.close();
  }
});

it('refreshes timestamps using final field winners after sealing', () => {
  pending(event);
  seal();
  pending({
    operationType: 'entity.patch',
    entityType: 'event',
    entityId: 'event',
    payload: { changes: { notes: 'Pending' }, updatedAt: earlier },
  });
  expect(db.select().from(events).get()?.updatedAt).toBe(earlier);
  seal();
  expect(db.select().from(events).get()).toMatchObject({
    notes: 'Pending',
    updatedAt: at,
  });
});

it('rolls back partially recorded history and preserves pending edits on failure', () => {
  pending(tag);
  pending(event);
  const pendingBefore = db.select().from(syncPendingOperations).all();
  const localBefore = db.select().from(syncLocalState).all();
  let calls = 0;
  expect(() =>
    db.transaction((tx) =>
      sealPendingOperations(tx, {
        now: () => {
          if (++calls === 2) throw new Error('Recording failed');
          return at;
        },
      })
    )
  ).toThrow('Recording failed');
  expect(db.select().from(syncOperations).all()).toEqual([]);
  expect(db.select().from(syncFieldVersions).all()).toEqual([]);
  expect(db.select().from(syncFrontiers).all()).toEqual([]);
  expect(db.select().from(syncLocalState).all()).toEqual(localBefore);
  expect(db.select().from(syncPendingOperations).all()).toEqual(pendingBefore);
  expect(seal()).toHaveLength(2);
});

it('rolls back history when the final timestamp refresh fails', () => {
  pending(event);
  seal();
  pending({
    operationType: 'entity.patch',
    entityType: 'event',
    entityId: 'event',
    payload: { changes: { notes: 'Pending' }, updatedAt: earlier },
  });
  const history = db.select().from(syncOperations).all();
  const versions = db.select().from(syncFieldVersions).all();
  const pendingBefore = db.select().from(syncPendingOperations).all();
  sqlite.run(
    "CREATE TRIGGER fail_refresh BEFORE UPDATE OF updated_at ON events BEGIN SELECT RAISE(ABORT, 'Refresh failed'); END"
  );
  expect(() => seal()).toThrow('Refresh failed');
  expect(db.select().from(syncOperations).all()).toEqual(history);
  expect(db.select().from(syncFieldVersions).all()).toEqual(versions);
  expect(db.select().from(syncPendingOperations).all()).toEqual(pendingBefore);
  expect(db.select().from(events).get()).toMatchObject({
    notes: 'Pending',
    updatedAt: earlier,
  });
});

it('seals retained deletions without resurrecting rows or replaying discarded patches', () => {
  pending(tag);
  seal();
  pending({
    operationType: 'entity.patch',
    entityType: 'tag',
    entityId: 'tag',
    payload: { changes: { name: 'Discarded' }, updatedAt: at },
  });
  pending({
    operationType: 'entity.delete',
    entityType: 'tag',
    entityId: 'tag',
    payload: { deletedAt: at },
  });
  expect(seal().map((op) => op.operationType)).toEqual(['entity.delete']);
  expect(db.select().from(tags).get()).toMatchObject({
    name: 'Travel',
    deletedAt: at,
  });
});
