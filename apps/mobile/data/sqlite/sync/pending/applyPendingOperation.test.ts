import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import type { AppDatabase } from '../../database';
import {
  tags,
  syncOperations,
  syncFrontiers,
  syncFieldVersions,
  syncLocalState,
  syncPendingOperations,
} from '../../schema';
import { createTestDatabase } from '../../testing/createTestDatabase';
import type { CreateOperationInput } from '../types';
import { applyPendingOperation } from './applyPendingOperation';

let sqlite: Database;
let database: AppDatabase;
const at = '2026-09-19T00:00:00.000Z';
const input: CreateOperationInput = {
  operationType: 'entity.create',
  entityType: 'tag',
  entityId: 'tag',
  payload: { name: 'Travel', createdAt: at, updatedAt: at },
};
beforeEach(async () => {
  ({ sqlite, database } = await createTestDatabase());
});
afterEach(() => sqlite.close());

it('folds patches into creation without writing sealed sync state', () => {
  database.transaction((tx) => {
    applyPendingOperation(input, tx);
    applyPendingOperation(
      {
        operationType: 'entity.patch',
        entityType: 'tag',
        entityId: 'tag',
        payload: { changes: { name: 'Trips' }, updatedAt: at },
      },
      tx
    );
  });
  expect(database.select().from(tags).get()).toMatchObject({
    id: 'tag',
    name: 'Trips',
    normalizedName: 'trips',
  });
  for (const table of [
    syncOperations,
    syncFrontiers,
    syncFieldVersions,
    syncLocalState,
  ]) {
    expect(database.select().from(table).all()).toEqual([]);
  }
  expect(database.select().from(syncPendingOperations).all()).toEqual([
    { ...input, payload: { ...input.payload, name: 'Trips' } },
  ]);
});

it('validates before mutation and propagates errors to roll back earlier writes', () => {
  expect(() =>
    database.transaction((tx) => {
      applyPendingOperation(input, tx);
      applyPendingOperation(
        {
          operationType: 'entity.patch',
          entityType: 'tag',
          entityId: 'tag',
          payload: { changes: { name: '' }, updatedAt: at },
        },
        tx
      );
    })
  ).toThrow();
  expect(database.select().from(tags).all()).toEqual([]);
});

it('propagates domain mutation failures', () => {
  expect(() =>
    database.transaction((tx) => {
      applyPendingOperation(input, tx);
      applyPendingOperation(input, tx);
    })
  ).toThrow();
  expect(database.select().from(tags).all()).toEqual([]);
});
