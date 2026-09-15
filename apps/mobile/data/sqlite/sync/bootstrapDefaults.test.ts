import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../database';
import {
  categories,
  tags,
  syncOperations,
  syncFrontiers,
  syncFieldVersions,
  syncLocalState,
} from '../schema';
import { createTestDatabase } from '../testing/createTestDatabase';
import { bootstrapDefaults } from './bootstrapDefaults';
import { defaultOperations, DEFAULTS_ORIGIN } from './defaultOperations';
import { createOperation } from './createOperation';
import { applyOperation } from './applyOperation';

let sqlite: Database;
let database: AppDatabase;
const at = '2026-09-15T00:00:00.000Z';
const dependencies = { now: () => at };
const id = '148d67ea-a892-412c-8293-4f469621ba43';
beforeEach(async () => {
  ({ sqlite, database } = await createTestDatabase({
    includeSeedData: true,
    initializeSyncState: true,
  }));
});
afterEach(() => sqlite.close());

it('adopts the exact SQL seeds, initializes history, and is idempotent', () => {
  const before = {
    categories: database.select().from(categories).all(),
    tags: database.select().from(tags).all(),
  };
  bootstrapDefaults(database, dependencies);
  expect(database.select().from(categories).all()).toEqual(before.categories);
  expect(database.select().from(tags).all()).toEqual(before.tags);
  expect(
    database
      .select()
      .from(syncOperations)
      .all()
      .map(({ receivedAt, appliedAt, ...operation }) => operation)
  ).toEqual(defaultOperations());
  for (const operation of defaultOperations()) {
    const row = [...before.categories, ...before.tags].find(
      (row) => row.id === operation.entityId
    )!;
    expect(row).toMatchObject(operation.payload);
  }
  expect(database.select().from(syncFieldVersions).all()).toHaveLength(15);
  expect(database.select().from(syncFrontiers).get()).toEqual({
    originDeviceId: DEFAULTS_ORIGIN,
    processedSequence: 6,
  });
  expect(database.select().from(syncLocalState).get()).toEqual({
    deviceId: 'test-device',
    observedLamport: 6,
  });
  const versions = database.select().from(syncFieldVersions).all();
  bootstrapDefaults(database, {
    now: () => {
      throw new Error('must not append twice');
    },
  });
  expect(database.select().from(syncFieldVersions).all()).toEqual(versions);
  const next = database.transaction((tx) =>
    createOperation(
      {
        operationType: 'entity.patch',
        entityType: 'category',
        entityId: id,
        payload: { changes: { color: 'green' }, updatedAt: at },
      },
      tx
    )
  );
  expect(next).toMatchObject({
    originDeviceId: 'test-device',
    originSequence: 1,
    lamport: 7,
    causalContext: { [DEFAULTS_ORIGIN]: 6 },
  });
});

it('preserves unrecorded edits and deletions as local history without rewriting domain rows', () => {
  database
    .update(categories)
    .set({
      name: 'My personal',
      normalizedName: 'my personal',
      color: 'green',
      updatedAt: at,
      deletedAt: at,
    })
    .where(eq(categories.id, id))
    .run();
  const before = database.select().from(categories).all();
  bootstrapDefaults(database, dependencies);
  expect(database.select().from(categories).all()).toEqual(before);
  const local = database
    .select()
    .from(syncOperations)
    .all()
    .filter((row) => row.originDeviceId === 'test-device');
  expect(local.map((row) => row.operationType)).toEqual([
    'entity.patch',
    'entity.delete',
  ]);
  expect(local[0]).toMatchObject({
    causalContext: { [DEFAULTS_ORIGIN]: 6 },
    payload: {
      changes: { name: 'My personal', color: 'green' },
      updatedAt: at,
    },
  });
  expect(
    database
      .select()
      .from(syncFieldVersions)
      .all()
      .filter((row) => row.entityId === id)
      .every((row) => row.winnerDeviceId === 'test-device')
  ).toBe(true);
  bootstrapDefaults(database, dependencies);
  expect(database.select().from(syncOperations).all()).toHaveLength(8);
});

it('does not replace existing recorded field winners or rewrite old operations', () => {
  database.transaction((tx) =>
    applyOperation(
      createOperation(
        {
          operationType: 'entity.patch',
          entityType: 'category',
          entityId: id,
          payload: { changes: { name: 'Renamed' }, updatedAt: at },
        },
        tx
      ),
      tx,
      dependencies
    )
  );
  const original = database.select().from(syncOperations).get();
  bootstrapDefaults(database, dependencies);
  expect(database.select().from(syncOperations).all()).toContainEqual(original);
  expect(database.select().from(syncOperations).all()).toHaveLength(7);
  expect(
    database
      .select()
      .from(syncFieldVersions)
      .all()
      .find((row) => row.entityId === id && row.fieldName === 'name')
  ).toMatchObject({ winnerDeviceId: 'test-device', winnerSequence: 1 });
});

it('produces identical seed history on an independent empty database', async () => {
  const other = await createTestDatabase({ initializeSyncState: true });
  try {
    bootstrapDefaults(database, dependencies);
    bootstrapDefaults(other.database, dependencies);
    expect(other.database.select().from(syncOperations).all()).toEqual(
      database.select().from(syncOperations).all()
    );
    expect(other.database.select().from(categories).all()).toEqual(
      database.select().from(categories).all()
    );
  } finally {
    other.sqlite.close();
  }
});

it('rolls back all bootstrap writes if recording fails', () => {
  expect(() =>
    bootstrapDefaults(database, {
      now: () => {
        throw new Error('failure');
      },
    })
  ).toThrow('failure');
  expect(database.select().from(syncOperations).all()).toEqual([]);
  expect(database.select().from(syncFrontiers).all()).toEqual([]);
  expect(database.select().from(syncFieldVersions).all()).toEqual([]);
  expect(database.select().from(syncLocalState).get()?.observedLamport).toBe(0);
});
