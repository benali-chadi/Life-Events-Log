import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import type { AppDatabase } from '../../database';
import { syncConflicts, syncPendingOperations, categories } from '../../schema';
import { createTestDatabase } from '../../testing/createTestDatabase';
import { applyOperation } from '../applyOperation';
import { createOperation } from '../createOperation';
import { applyPendingOperation } from './applyPendingOperation';
import type { CreateOperationInput } from '../types';

let sqlite: Database;
let db: AppDatabase;
const at = '2026-09-19T00:00:00.000Z';
const patch: CreateOperationInput = {
  operationType: 'entity.patch',
  entityType: 'category',
  entityId: 'category',
  payload: { changes: { name: 'Travel' }, updatedAt: at },
};
beforeEach(async () => {
  ({ sqlite, database: db } = await createTestDatabase({
    initializeSyncState: true,
  }));
  db.transaction((tx) =>
    applyOperation(
      createOperation(
        {
          operationType: 'entity.create',
          entityType: 'category',
          entityId: 'category',
          payload: {
            name: 'Travel',
            color: 'blue',
            createdAt: at,
            updatedAt: at,
          },
        },
        tx
      ),
      tx
    )
  );
  // Conflict history is irrelevant to local dismissal; seed the UI records directly.
  db.insert(syncConflicts)
    .values(
      [
        {
          conflictId: 'name',
          entityType: 'category',
          entityId: 'category',
          fieldName: 'name',
        },
        {
          conflictId: 'color',
          entityType: 'category',
          entityId: 'category',
          fieldName: 'color',
        },
        {
          conflictId: 'other-id',
          entityType: 'category',
          entityId: 'other',
          fieldName: 'name',
        },
        {
          conflictId: 'other-type',
          entityType: 'tag',
          entityId: 'category',
          fieldName: 'name',
        },
      ].map((row) => ({
        ...row,
        winningDeviceId: 'a',
        winningSequence: 1,
        losingDeviceId: 'b',
        losingSequence: 1,
        status: 'pending' as const,
      })) as (typeof syncConflicts.$inferInsert)[]
    )
    .run();
});
afterEach(() => sqlite.close());
const conflicts = () =>
  db
    .select()
    .from(syncConflicts)
    .all()
    .map((row) => row.conflictId)
    .sort();

it('acknowledges an explicit unchanged value without clearing other fields or entities', () => {
  db.transaction((tx) => applyPendingOperation(patch, tx));
  expect(conflicts()).toEqual(['color', 'other-id', 'other-type']);
  expect(db.select().from(syncPendingOperations).get()?.payload).toEqual(
    patch.payload
  );
});

it('clears every targeted field in a multi-field patch', () => {
  db.transaction((tx) =>
    applyPendingOperation(
      {
        ...patch,
        payload: { changes: { name: 'Trips', color: 'rose' }, updatedAt: at },
      },
      tx
    )
  );
  expect(conflicts()).toEqual(['other-id', 'other-type']);
});

it('clears all conflicts for a deleted entity only', () => {
  db.transaction((tx) =>
    applyPendingOperation(
      {
        operationType: 'entity.delete',
        entityType: 'category',
        entityId: 'category',
        payload: { deletedAt: at },
      },
      tx
    )
  );
  expect(conflicts()).toEqual(['other-id', 'other-type']);
});

it('rolls back acknowledgment, pending intent and domain changes together', () => {
  expect(() =>
    db.transaction((tx) => {
      applyPendingOperation(
        { ...patch, payload: { changes: { name: 'Trips' }, updatedAt: at } },
        tx
      );
      throw new Error('abort');
    })
  ).toThrow('abort');
  expect(conflicts()).toEqual(['color', 'name', 'other-id', 'other-type']);
  expect(db.select().from(categories).get()?.name).toBe('Travel');
  expect(db.select().from(syncPendingOperations).all()).toEqual([]);
});

it('does not acknowledge invalid patches', () => {
  expect(() =>
    db.transaction((tx) =>
      applyPendingOperation(
        { ...patch, payload: { changes: { name: '' }, updatedAt: at } },
        tx
      )
    )
  ).toThrow();
  expect(conflicts()).toEqual(['color', 'name', 'other-id', 'other-type']);
});
