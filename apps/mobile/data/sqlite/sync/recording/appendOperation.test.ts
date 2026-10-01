import type { Database } from 'sql.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppDatabase } from '../../database';
import {
  syncFieldVersions,
  syncFrontiers,
  syncLocalState,
  syncOperations,
  events,
} from '../../schema';
import { createTestDatabase } from '../../testing/createTestDatabase';
import { appendOperation } from './appendOperation';
import { createOperation } from '../createOperation';
import { hashOperationContent } from '../utils/hashOperationContent';
import type { Operation } from '../types';

let sqlite: Database;
let database: AppDatabase;
const timestamp = '2026-09-11T12:00:00.000Z';
const dependencies = { now: () => timestamp };
const input = {
  operationType: 'entity.patch' as const,
  entityType: 'event' as const,
  entityId: 'event',
  payload: {
    changes: { title: 'Title', notes: 'Notes' },
    updatedAt: timestamp,
  },
};
beforeEach(async () => {
  ({ sqlite, database } = await createTestDatabase());
  database
    .insert(syncLocalState)
    .values({ deviceId: 'local', observedLamport: 0 })
    .run();
});
afterEach(() => sqlite.close());

it('records local operations, unique winners and one injected timestamp', () => {
  const now = vi.fn(() => timestamp);
  database.transaction((tx) => {
    const operation = createOperation(input, tx);
    appendOperation(operation, tx, ['title', 'title'], { now });
    expect(tx.select().from(syncOperations).get()).toEqual({
      ...operation,
      receivedAt: timestamp,
      appliedAt: timestamp,
    });
    expect(createOperation(input, tx)).toMatchObject({
      originSequence: 2,
      lamport: 2,
      causalContext: { local: 1 },
    });
  });
  expect(now).toHaveBeenCalledTimes(1);
  expect(database.select().from(syncFieldVersions).all()).toEqual([
    {
      entityType: 'event',
      entityId: 'event',
      fieldName: 'title',
      winnerDeviceId: 'local',
      winnerSequence: 1,
      winnerLamport: 1,
    },
  ]);
  expect(database.select().from(events).all()).toEqual([]);
});

it('replaces only supplied winners and records losing remote operations', () => {
  database.transaction((tx) => {
    appendOperation(
      createOperation(input, tx),
      tx,
      ['title', 'notes'],
      dependencies
    );
    appendOperation(createOperation(input, tx), tx, ['title'], dependencies);
    const content = {
      ...input,
      originDeviceId: 'remote',
      originSequence: 1,
      lamport: 1,
      causalContext: {},
    };
    const remote: Operation = {
      ...content,
      operationHash: hashOperationContent(content),
    };
    appendOperation(remote, tx, [], dependencies);
  });
  const fields = database.select().from(syncFieldVersions).all();
  expect(
    fields.find((field) => field.fieldName === 'title')?.winnerSequence
  ).toBe(2);
  expect(
    fields.find((field) => field.fieldName === 'notes')?.winnerSequence
  ).toBe(1);
  expect(database.select().from(syncOperations).all()).toHaveLength(3);
  expect(database.select().from(syncLocalState).get()?.observedLamport).toBe(2);
  expect(database.select().from(syncFrontiers).all()).toEqual([
    { originDeviceId: 'local', processedSequence: 2 },
    { originDeviceId: 'remote', processedSequence: 1 },
  ]);
});

it('raises the observed clock for remote operations without changing local sequence', () => {
  database.transaction((tx) => {
    const content = {
      ...input,
      originDeviceId: 'remote',
      originSequence: 1,
      lamport: 100,
      causalContext: {},
    };
    appendOperation(
      { ...content, operationHash: hashOperationContent(content) },
      tx,
      [],
      dependencies
    );
    expect(createOperation(input, tx)).toMatchObject({
      originSequence: 1,
      lamport: 101,
    });
  });
});

it('rejects gaps and duplicate appends', () => {
  database.transaction((tx) => {
    const operation = createOperation(input, tx);
    expect(() =>
      appendOperation({ ...operation, originSequence: 2 }, tx, [], dependencies)
    ).toThrow('Expected local:1');
    appendOperation(operation, tx, [], dependencies);
    expect(() => appendOperation(operation, tx, [], dependencies)).toThrow(
      'Expected local:2'
    );
  });
  expect(database.select().from(syncOperations).all()).toHaveLength(1);
});

it('rolls back domain and sync writes when an append fails partway through', () => {
  sqlite.run(
    "CREATE TRIGGER fail_frontier BEFORE INSERT ON sync_frontiers BEGIN SELECT RAISE(ABORT, 'frontier failure'); END"
  );
  expect(() =>
    database.transaction((tx) => {
      tx.insert(events)
        .values({
          id: 'event',
          title: 'Title',
          date: '2026-09-11',
          time: null,
          significance: 'ordinary',
          notes: '',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run();
      appendOperation(createOperation(input, tx), tx, ['title'], dependencies);
    })
  ).toThrow();
  expect(database.select().from(events).all()).toEqual([]);
  expect(database.select().from(syncOperations).all()).toEqual([]);
  expect(database.select().from(syncFieldVersions).all()).toEqual([]);
  expect(database.select().from(syncFrontiers).all()).toEqual([]);
  expect(database.select().from(syncLocalState).get()?.observedLamport).toBe(0);
});
