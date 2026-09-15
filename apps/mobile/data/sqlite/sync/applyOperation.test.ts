import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import type { AppDatabase } from '../database';
import {
  events,
  syncLocalState,
  syncFrontiers,
  syncOperations,
  syncFieldVersions,
} from '../schema';
import { createTestDatabase } from '../testing/createTestDatabase';
import { applyOperation } from './applyOperation';
import { createOperation } from './createOperation';
import type { CreateOperationInput } from './types';

let sqlite: Database;
let database: AppDatabase;
const at = '2026-09-15T00:00:00.000Z';
const dependencies = { now: () => at };
const input: CreateOperationInput = {
  operationType: 'entity.create',
  entityType: 'event',
  entityId: 'event',
  payload: {
    title: 'Hello',
    date: '2026-09-15',
    time: null,
    significance: 'ordinary',
    categoryId: null,
    locationId: null,
    notes: '',
    createdAt: at,
    updatedAt: at,
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

it('validates, inserts, records versions and advances clocks; duplicate delivery is a no-op', () => {
  database.transaction((tx) => {
    const operation = createOperation(input, tx);
    expect(applyOperation(operation, tx, dependencies)).toBe('applied');
    expect(
      applyOperation(operation, tx, {
        now: () => {
          throw new Error('duplicate must not append');
        },
      })
    ).toBe('already-applied');
    expect(
      createOperation({ ...input, entityId: 'next' }, tx).originSequence
    ).toBe(2);
  });
  expect(database.select().from(events).all()).toHaveLength(1);
  expect(database.select().from(syncOperations).all()).toHaveLength(1);
  expect(database.select().from(syncOperations).get()).toMatchObject({
    receivedAt: at,
    appliedAt: at,
  });
  expect(database.select().from(syncFrontiers).get()).toEqual({
    originDeviceId: 'local',
    processedSequence: 1,
  });
  expect(database.select().from(syncLocalState).get()?.observedLamport).toBe(1);
  const versions = database.select().from(syncFieldVersions).all();
  expect(versions.map((row) => row.fieldName).sort()).toEqual([
    'category_id',
    'date',
    'deleted_at',
    'location_id',
    'notes',
    'significance',
    'time',
    'title',
  ]);
  for (const row of versions)
    expect(row).toMatchObject({
      entityId: 'event',
      winnerDeviceId: 'local',
      winnerSequence: 1,
      winnerLamport: 1,
    });
});

it('rejects invalid integrity before writing', () => {
  expect(() =>
    database.transaction((tx) =>
      applyOperation(
        { ...createOperation(input, tx), operationHash: 'bad' },
        tx
      )
    )
  ).toThrow();
  expect(database.select().from(events).all()).toEqual([]);
  expect(database.select().from(syncOperations).all()).toEqual([]);
});

it('rolls back domain writes if appending fails', () => {
  expect(() =>
    database.transaction((tx) =>
      applyOperation(createOperation(input, tx), tx, {
        now: () => {
          throw new Error('clock failure');
        },
      })
    )
  ).toThrow('clock failure');
  expect(database.select().from(events).all()).toEqual([]);
  expect(database.select().from(syncOperations).all()).toEqual([]);
  expect(database.select().from(syncFrontiers).all()).toEqual([]);
  expect(database.select().from(syncFieldVersions).all()).toEqual([]);
  expect(database.select().from(syncLocalState).get()?.observedLamport).toBe(0);
});

it('does not append unsupported mutations', () => {
  expect(() =>
    database.transaction((tx) =>
      applyOperation(
        createOperation(
          {
            operationType: 'attachment.delete',
            entityType: 'attachment',
            entityId: 'event',
            payload: { deletedAt: at },
          },
          tx
        ),
        tx
      )
    )
  ).toThrow('not implemented');
  expect(database.select().from(syncOperations).all()).toEqual([]);
});

it('does not append when the domain insert fails', () => {
  database.transaction((tx) =>
    applyOperation(createOperation(input, tx), tx, dependencies)
  );
  expect(() =>
    database.transaction((tx) =>
      applyOperation(createOperation(input, tx), tx, dependencies)
    )
  ).toThrow();
  expect(database.select().from(syncOperations).all()).toHaveLength(1);
  expect(database.select().from(syncFrontiers).get()?.processedSequence).toBe(
    1
  );
});
