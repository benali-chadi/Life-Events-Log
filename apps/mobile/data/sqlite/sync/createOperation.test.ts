import type { Database } from 'sql.js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { hashOperationContent } from './utils/hashOperationContent';
import type { CreateOperationInput, JsonObject } from './types';
import type { AppDatabase } from '../database';
import {
  syncFrontiers,
  syncLocalState,
  syncOperations,
  events,
} from '../schema';
import { createTestDatabase } from '../testing/createTestDatabase';
import { createOperation } from './createOperation';

let sqlite: Database;
let database: AppDatabase;
const input: CreateOperationInput = {
  operationType: 'entity.create',
  entityType: 'event',
  entityId: 'caller-id',
  payload: { title: 'Travel', nested: { ids: ['a', 'b'] } },
};
beforeEach(async () => {
  ({ sqlite, database } = await createTestDatabase());
});
afterEach(() => sqlite.close());

it('requires initialized state without initializing it implicitly', () => {
  expect(() =>
    database.transaction((tx) => createOperation(input, tx))
  ).toThrow('not been initialized');
  expect(database.select().from(syncLocalState).all()).toEqual([]);
});

it('builds the first operation and writes nothing', () => {
  database
    .insert(syncLocalState)
    .values({ deviceId: 'local', observedLamport: 0 })
    .run();
  const result = database.transaction((tx) => createOperation(input, tx));
  expect(result).toMatchObject({
    ...input,
    originDeviceId: 'local',
    originSequence: 1,
    lamport: 1,
    causalContext: {},
  });
  expect(result.operationHash).toBe(hashOperationContent(result));
  expect(database.select().from(syncFrontiers).all()).toEqual([]);
  expect(database.select().from(syncOperations).all()).toEqual([]);
  expect(database.select().from(events).all()).toEqual([]);
  expect(database.select().from(syncLocalState).get()?.observedLamport).toBe(0);
});

it('reads current transaction state and snapshots every origin without advancing it', () => {
  database.transaction((tx) => {
    tx.insert(syncLocalState)
      .values({ deviceId: 'local', observedLamport: 90 })
      .run();
    tx.insert(syncFrontiers)
      .values([
        { originDeviceId: 'local', processedSequence: 4 },
        { originDeviceId: 'remote', processedSequence: 8 },
      ])
      .run();
    const result = createOperation(input, tx);
    expect(result).toMatchObject({
      originSequence: 5,
      lamport: 91,
      causalContext: { local: 4, remote: 8 },
    });
    expect(createOperation(input, tx)).toEqual(result);
  });
  expect(database.select().from(syncFrontiers).all()).toEqual([
    { originDeviceId: 'local', processedSequence: 4 },
    { originDeviceId: 'remote', processedSequence: 8 },
  ]);
});

it('isolates nested payloads from subsequent caller mutations', () => {
  database
    .insert(syncLocalState)
    .values({ deviceId: 'local', observedLamport: 0 })
    .run();
  const payload = { nested: { ids: ['a'] } };
  const result = database.transaction((tx) =>
    createOperation({ ...input, payload }, tx)
  );
  payload.nested.ids.push('b');
  expect(result.payload.nested.ids).toEqual(['a']);
  expect(result.operationHash).toBe(hashOperationContent(result));
});

it('rejects invalid payloads before serialization can discard them', () => {
  database
    .insert(syncLocalState)
    .values({ deviceId: 'local', observedLamport: 0 })
    .run();
  expect(() =>
    database.transaction((tx) =>
      createOperation(
        { ...input, payload: { value: undefined } as unknown as JsonObject },
        tx
      )
    )
  ).toThrow();
});

it.each(['sequence', 'lamport'])('rejects %s overflow', (counter) => {
  database
    .insert(syncLocalState)
    .values({
      deviceId: 'local',
      observedLamport: counter === 'lamport' ? Number.MAX_SAFE_INTEGER : 0,
    })
    .run();
  database
    .insert(syncFrontiers)
    .values({
      originDeviceId: 'local',
      processedSequence: counter === 'sequence' ? Number.MAX_SAFE_INTEGER : 0,
    })
    .run();
  expect(() =>
    database.transaction((tx) => createOperation(input, tx))
  ).toThrow('integer range');
});
