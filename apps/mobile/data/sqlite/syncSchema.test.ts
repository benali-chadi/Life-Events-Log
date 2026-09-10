import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import type { AppDatabase } from './database';
import {
  syncLocalState,
  syncOperations,
  syncFieldVersions,
  syncConflicts,
} from './schema';
import { createTestDatabase } from './testing/createTestDatabase';

let sqlite: Database;
let database: AppDatabase;
beforeEach(async () => {
  ({ sqlite, database } = await createTestDatabase());
});
afterEach(() => sqlite.close());

it('enforces a single local replica state', () => {
  database
    .insert(syncLocalState)
    .values({ deviceId: 'a', observedLamport: 0 })
    .run();
  expect(() =>
    database
      .insert(syncLocalState)
      .values({ deviceId: 'b', observedLamport: 0 })
      .run()
  ).toThrow();
});

it('round trips JSON and supports composite relation identities', () => {
  const entityId = JSON.stringify(['event-a', 'tag-a']);
  const operation = {
    originDeviceId: 'a',
    originSequence: 1,
    lamport: 1,
    causalContext: { b: 2 },
    operationType: 'relation.add' as const,
    entityType: 'event_tag' as const,
    entityId,
    payload: { eventId: 'event-a', tagId: 'tag-a' },
    operationHash: 'hash',
    receivedAt: '2026-09-10T00:00:00.000Z',
    appliedAt: '2026-09-10T00:00:00.000Z',
  };
  database.insert(syncOperations).values(operation).run();
  expect(database.select().from(syncOperations).get()).toEqual(operation);
  expect(() =>
    database.insert(syncOperations).values(operation).run()
  ).toThrow();
  database
    .insert(syncFieldVersions)
    .values({
      entityType: 'event_tag',
      entityId,
      fieldName: 'deleted_at',
      winnerDeviceId: 'a',
      winnerSequence: 1,
      winnerLamport: 1,
    })
    .run();
  expect(database.select().from(syncFieldVersions).get()?.entityId).toBe(
    entityId
  );
});

it('rejects partial resolution references', () => {
  expect(() =>
    database
      .insert(syncConflicts)
      .values({
        conflictId: 'conflict',
        entityType: 'event',
        entityId: 'event',
        fieldName: 'title',
        winningDeviceId: 'a',
        winningSequence: 1,
        losingDeviceId: 'b',
        losingSequence: 1,
        status: 'resolved',
        resolutionDeviceId: 'a',
        resolutionSequence: null,
      })
      .run()
  ).toThrow();
});

it('rolls back sync records with the surrounding transaction', () => {
  expect(() =>
    database.transaction((tx) => {
      tx.insert(syncLocalState)
        .values({ deviceId: 'a', observedLamport: 0 })
        .run();
      throw new Error('abort');
    })
  ).toThrow('abort');
  expect(database.select().from(syncLocalState).all()).toEqual([]);
});
