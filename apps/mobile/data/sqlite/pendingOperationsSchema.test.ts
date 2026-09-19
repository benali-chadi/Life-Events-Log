import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import type { AppDatabase } from './database';
import { syncPendingOperations } from './schema';
import type { PendingOperation } from './sync/types';
import { createTestDatabase } from './testing/createTestDatabase';

let sqlite: Database;
let database: AppDatabase;
beforeEach(async () => {
  ({ sqlite, database } = await createTestDatabase());
});
afterEach(() => sqlite.close());

const addition: PendingOperation = {
  operationType: 'relation.add',
  entityType: 'event_tag',
  entityId: JSON.stringify(['event-a', 'tag-a']),
  payload: {
    eventId: 'event-a',
    tagId: 'tag-a',
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
  },
};

it('round trips pending payloads without replication metadata', () => {
  database.insert(syncPendingOperations).values(addition).run();
  expect(database.select().from(syncPendingOperations).get()).toEqual(addition);
});

it('allows add and remove together but rejects duplicate operation slots', () => {
  database.insert(syncPendingOperations).values(addition).run();
  database
    .insert(syncPendingOperations)
    .values({
      operationType: 'relation.remove',
      entityType: addition.entityType,
      entityId: addition.entityId,
      payload: {
        eventId: 'event-a',
        tagId: 'tag-a',
        deletedAt: '2026-09-19T01:00:00.000Z',
      },
    })
    .run();
  expect(database.select().from(syncPendingOperations).all()).toHaveLength(2);
  expect(() =>
    database.insert(syncPendingOperations).values(addition).run()
  ).toThrow();
});

it('keeps entity types independent even when IDs and operation types match', () => {
  for (const entityType of ['tag', 'person'] as const) {
    database
      .insert(syncPendingOperations)
      .values({
        operationType: 'entity.delete',
        entityType,
        entityId: 'same-id',
        payload: { deletedAt: '2026-09-19T00:00:00.000Z' },
      })
      .run();
  }
  expect(database.select().from(syncPendingOperations).all()).toHaveLength(2);
});

it('rolls back pending changes with the surrounding transaction', () => {
  expect(() =>
    database.transaction((tx) => {
      tx.insert(syncPendingOperations).values(addition).run();
      throw new Error('abort');
    })
  ).toThrow('abort');
  expect(database.select().from(syncPendingOperations).all()).toEqual([]);
});
