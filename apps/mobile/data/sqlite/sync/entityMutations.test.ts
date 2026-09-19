import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import type { AppDatabase } from '../database';
import {
  categories,
  tags,
  people,
  locations,
  events,
  syncOperations,
  syncFieldVersions,
  syncPendingOperations,
} from '../schema';
import { createTestDatabase } from '../testing/createTestDatabase';
import { createOperation } from './createOperation';
import { applyOperation } from './applyOperation';
import { applyDomainMutation } from './applyDomainMutation';
import type { CreateOperationInput } from './types';
import { SQLiteCategoryRepository } from '../repositories/SQLiteCategoryRepository';
import { SQLiteTagRepository } from '../repositories/SQLiteTagRepository';
import { SQLitePersonRepository } from '../repositories/SQLitePersonRepository';
import { SQLiteLocationRepository } from '../repositories/SQLiteLocationRepository';
import { SQLiteEventRepository } from '../repositories/SQLiteEventRepository';

let sqlite: Database;
let database: AppDatabase;
const at = '2026-09-15T00:00:00.000Z';
const later = '2026-09-16T00:00:00.000Z';
const tables = {
  category: categories,
  tag: tags,
  person: people,
  location: locations,
};
beforeEach(async () => {
  ({ sqlite, database } = await createTestDatabase({
    initializeSyncState: true,
  }));
});
afterEach(() => sqlite.close());
function apply(input: CreateOperationInput) {
  database.transaction((tx) =>
    applyOperation(createOperation(input, tx), tx, { now: () => at })
  );
}

it.each(['category', 'tag', 'person', 'location'] as const)(
  'compacts %s repository mutations and cancels unsealed deletion',
  async (entity) => {
    const dependencies = { createId: () => 'id', now: () => at };
    const repositories = {
      category: new SQLiteCategoryRepository(database, dependencies),
      tag: new SQLiteTagRepository(database, dependencies),
      person: new SQLitePersonRepository(database, dependencies),
      location: new SQLiteLocationRepository(database, dependencies),
    };
    const repository = repositories[entity];
    await repository.create({ name: 'Original', color: 'blue' });
    await repository.update('id', { name: 'Changed' });
    await repository.softDelete('id');
    expect(database.select().from(tables[entity]).all()).toEqual([]);
    expect(database.select().from(syncOperations).all()).toEqual([]);
    expect(database.select().from(syncPendingOperations).all()).toEqual([]);
  }
);

it('keeps sealed history unchanged while repositories patch and delete a sealed entity', async () => {
  apply({
    operationType: 'entity.create',
    entityType: 'category',
    entityId: 'sealed',
    payload: { name: 'Original', color: 'blue', createdAt: at, updatedAt: at },
  });
  const history = database.select().from(syncOperations).all();
  const versions = database.select().from(syncFieldVersions).all();
  const repository = new SQLiteCategoryRepository(database, {
    createId: () => 'unused',
    now: () => later,
  });
  await repository.update('sealed', { name: 'Pending' });
  expect(database.select().from(syncPendingOperations).get()).toMatchObject({
    operationType: 'entity.patch',
    payload: { changes: { name: 'Pending' }, updatedAt: later },
  });
  await repository.softDelete('sealed');
  await repository.softDelete('sealed');
  expect(database.select().from(categories).get()).toMatchObject({
    name: 'Original',
    deletedAt: later,
  });
  expect(database.select().from(syncPendingOperations).all()).toMatchObject([
    { operationType: 'entity.delete' },
  ]);
  expect(database.select().from(syncOperations).all()).toEqual(history);
  expect(database.select().from(syncFieldVersions).all()).toEqual(versions);
});

it('folds event edits into pending creation and preserves atomic batch deletion', async () => {
  let id = 0;
  const repository = new SQLiteEventRepository(database, {
    createId: () => `event-${++id}`,
    now: () => at,
  });
  const values = {
    title: 'Title',
    date: '2026-09-15' as const,
    time: null,
    significance: 'ordinary' as const,
    categoryId: null,
    locationId: null,
    notes: '',
    tagIds: [],
    peopleIds: [],
  };
  await repository.create(values);
  await repository.create(values);
  await repository.update('event-1', { notes: 'Changed' });
  expect(
    database
      .select()
      .from(syncPendingOperations)
      .all()
      .find((row) => row.entityId === 'event-1')?.payload
  ).toMatchObject({ notes: 'Changed', updatedAt: at });
  await expect(
    repository.softDeleteMany(['event-1', 'missing'])
  ).rejects.toThrow('not found');
  expect(database.select().from(syncPendingOperations).all()).toHaveLength(2);
  await repository.softDeleteMany(['event-1', 'event-2']);
  expect(database.select().from(syncOperations).all()).toEqual([]);
  expect(database.select().from(syncPendingOperations).all()).toEqual([]);
  expect(database.select().from(events).all()).toEqual([]);
});

it.each(['category', 'tag', 'person', 'location'] as const)(
  'creates, patches and tombstones %s with field versions',
  (entityType) => {
    apply(
      entityType === 'category'
        ? {
            operationType: 'entity.create',
            entityType,
            entityId: 'id',
            payload: {
              name: 'Été',
              color: 'blue',
              createdAt: at,
              updatedAt: at,
            },
          }
        : {
            operationType: 'entity.create',
            entityType,
            entityId: 'id',
            payload: { name: 'Été', createdAt: at, updatedAt: at },
          }
    );
    apply({
      operationType: 'entity.patch',
      entityType,
      entityId: 'id',
      payload: { changes: { name: 'Voyage' }, updatedAt: later },
    });
    expect(database.select().from(tables[entityType]).get()).toMatchObject({
      name: 'Voyage',
      normalizedName: 'voyage',
      createdAt: at,
      updatedAt: later,
      deletedAt: null,
    });
    apply({
      operationType: 'entity.delete',
      entityType,
      entityId: 'id',
      payload: { deletedAt: later },
    });
    expect(database.select().from(tables[entityType]).get()?.deletedAt).toBe(
      later
    );
    expect(database.select().from(syncOperations).all()).toHaveLength(3);
    const versions = database.select().from(syncFieldVersions).all();
    expect(
      versions.find((row) => row.fieldName === 'name')?.winnerSequence
    ).toBe(2);
    expect(
      versions.find((row) => row.fieldName === 'deleted_at')?.winnerSequence
    ).toBe(3);
    if (entityType === 'category')
      expect(
        versions.find((row) => row.fieldName === 'color')?.winnerSequence
      ).toBe(1);
  }
);

it('writes only winning fields and ignores losing-operation timestamps', () => {
  apply({
    operationType: 'entity.create',
    entityType: 'category',
    entityId: 'id',
    payload: { name: 'Original', color: 'blue', createdAt: at, updatedAt: at },
  });
  database.transaction((tx) => {
    const operation = createOperation(
      {
        operationType: 'entity.patch',
        entityType: 'category',
        entityId: 'id',
        payload: { changes: { name: 'New', color: 'green' }, updatedAt: later },
      },
      tx
    );
    applyDomainMutation(operation, [], tx);
    expect(tx.select().from(categories).get()).toMatchObject({
      name: 'Original',
      updatedAt: at,
    });
    applyDomainMutation(operation, ['color'], tx);
    applyDomainMutation(
      createOperation(
        {
          operationType: 'entity.delete',
          entityType: 'category',
          entityId: 'id',
          payload: { deletedAt: later },
        },
        tx
      ),
      [],
      tx
    );
  });
  expect(database.select().from(categories).get()).toMatchObject({
    name: 'Original',
    normalizedName: 'original',
    color: 'green',
    updatedAt: later,
    deletedAt: null,
  });
});

it('patches event nullable fields and search title without changing creation time', () => {
  apply({
    operationType: 'entity.create',
    entityType: 'event',
    entityId: 'event',
    payload: {
      title: 'First',
      date: '2026-09-15',
      time: '12:00',
      significance: 'ordinary',
      categoryId: null,
      locationId: null,
      notes: '',
      createdAt: at,
      updatedAt: at,
    },
  });
  apply({
    operationType: 'entity.patch',
    entityType: 'event',
    entityId: 'event',
    payload: {
      changes: { title: 'Été', time: null, notes: 'Notes' },
      updatedAt: later,
    },
  });
  expect(database.select().from(events).get()).toMatchObject({
    title: 'Été',
    normalizedTitle: 'été',
    time: null,
    notes: 'Notes',
    createdAt: at,
    updatedAt: later,
  });
  apply({
    operationType: 'entity.delete',
    entityType: 'event',
    entityId: 'event',
    payload: { deletedAt: later },
  });
  expect(database.select().from(events).get()?.deletedAt).toBe(later);
});

it('rejects missing patch/delete targets without recording an operation', () => {
  expect(() =>
    apply({
      operationType: 'entity.patch',
      entityType: 'tag',
      entityId: 'missing',
      payload: { changes: { name: 'Name' }, updatedAt: at },
    })
  ).toThrow('not found');
  expect(() =>
    apply({
      operationType: 'entity.delete',
      entityType: 'tag',
      entityId: 'missing',
      payload: { deletedAt: at },
    })
  ).toThrow('not found');
  expect(database.select().from(syncOperations).all()).toEqual([]);
});

it('rolls back a uniqueness violation without advancing history', () => {
  apply({
    operationType: 'entity.create',
    entityType: 'tag',
    entityId: 'a',
    payload: { name: 'Same', createdAt: at, updatedAt: at },
  });
  expect(() =>
    apply({
      operationType: 'entity.create',
      entityType: 'tag',
      entityId: 'b',
      payload: { name: 'Same', createdAt: at, updatedAt: at },
    })
  ).toThrow();
  expect(database.select().from(tags).all()).toHaveLength(1);
  expect(database.select().from(syncOperations).all()).toHaveLength(1);
});
