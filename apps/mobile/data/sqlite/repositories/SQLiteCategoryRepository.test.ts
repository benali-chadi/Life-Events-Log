import { recordSealedCreation } from '../testing/recordSealedCreation';
import type { Database } from 'sql.js';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DuplicateNameError,
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type RepositoryDependencies,
} from '@/data/repositories';
import type { CategoryColor } from '@/models';
import type { AppDatabase } from '../database';
import { categories, events } from '../schema';
import { createTestDatabase } from '../testing/createTestDatabase';
import { SQLiteCategoryRepository } from './SQLiteCategoryRepository';

const NOW = '2026-08-18T10:00:00.000Z';
const CATEGORY_ID = '10000000-0000-4000-8000-000000000001';
const GENERATED_ID = '90000000-0000-4000-8000-000000000001';

const dependencies: RepositoryDependencies = {
  createId: () => GENERATED_ID,
  now: () => NOW,
};

function insertEvent(
  database: AppDatabase,
  {
    id,
    categoryId,
    deletedAt = null,
  }: { id: string; categoryId: string | null; deletedAt?: string | null }
) {
  database
    .insert(events)
    .values({
      id,
      title: id,
      normalizedTitle: id.toLowerCase(),
      date: '2026-08-18',
      time: null,
      significance: 'ordinary',
      categoryId,
      locationId: null,
      notes: '',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt,
    })
    .run();
}

describe('SQLiteCategoryRepository', () => {
  let sqlite: Database;
  let database: AppDatabase;
  let repository: SQLiteCategoryRepository;

  beforeEach(async () => {
    ({ sqlite, database } = await createTestDatabase({
      initializeSyncState: true,
    }));
    repository = new SQLiteCategoryRepository(database, dependencies);

    database
      .insert(categories)
      .values({
        id: CATEGORY_ID,
        name: 'Personal',
        normalizedName: 'personal',
        color: 'green',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        deletedAt: null,
      })
      .run();
  });

  afterEach(() => sqlite.close());

  it('creates, reads, searches, and partially updates categories', async () => {
    const created = await repository.create({
      name: '  Work   Projects ',
      color: 'blue',
    });

    expect(created).toEqual({
      id: GENERATED_ID,
      name: 'Work Projects',
      color: 'blue',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
    await expect(repository.getById(GENERATED_ID)).resolves.toEqual(created);
    await expect(repository.list({ search: ' projects ' })).resolves.toEqual([
      created,
    ]);

    const updated = await repository.update(GENERATED_ID, { color: 'violet' });
    expect(updated).toMatchObject({
      name: 'Work Projects',
      color: 'violet',
      updatedAt: NOW,
    });
    await expect(repository.update(GENERATED_ID, {})).resolves.toEqual(updated);
    expect(
      database
        .select({ value: categories.normalizedName })
        .from(categories)
        .where(eq(categories.id, GENERATED_ID))
        .get()?.value
    ).toBe('work projects');
  });

  it('validates names, colors, active uniqueness, missing IDs, and generated IDs', async () => {
    await expect(
      repository.create({ name: '   ', color: 'blue' })
    ).rejects.toBeInstanceOf(ModelValidationError);
    await expect(
      repository.create({
        name: 'Invalid',
        color: 'invalid' as CategoryColor,
      })
    ).rejects.toBeInstanceOf(ModelValidationError);
    await expect(
      repository.create({ name: 'PERSONAL', color: 'blue' })
    ).rejects.toBeInstanceOf(DuplicateNameError);
    await expect(
      repository.update('missing-category', { name: 'Missing' })
    ).rejects.toBeInstanceOf(EntityNotFoundError);

    await repository.create({ name: 'Projects', color: 'blue' });
    await expect(
      repository.create({ name: 'Travel', color: 'rose' })
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('counts usage from active events and sorts by usage then name', async () => {
    await repository.create({ name: 'Projects', color: 'blue' });
    insertEvent(database, { id: 'event-1', categoryId: CATEGORY_ID });
    insertEvent(database, { id: 'event-2', categoryId: CATEGORY_ID });
    insertEvent(database, { id: 'event-3', categoryId: GENERATED_ID });
    insertEvent(database, {
      id: 'deleted-event',
      categoryId: GENERATED_ID,
      deletedAt: NOW,
    });

    await expect(repository.listWithUsage()).resolves.toMatchObject([
      { metadata: { name: 'Personal' }, eventCount: 2 },
      { metadata: { name: 'Projects' }, eventCount: 1 },
    ]);
  });

  it('tombstones categories, preserves references, and is idempotent', async () => {
    insertEvent(database, { id: 'event-1', categoryId: CATEGORY_ID });
    insertEvent(database, {
      id: 'deleted-event',
      categoryId: CATEGORY_ID,
      deletedAt: NOW,
    });

    recordSealedCreation(database, 'category', CATEGORY_ID);
    await expect(repository.softDelete(CATEGORY_ID)).resolves.toEqual({
      affectedEventIds: ['deleted-event', 'event-1'],
    });
    await expect(repository.getById(CATEGORY_ID)).resolves.toBeNull();
    await expect(repository.list()).resolves.toEqual([]);
    expect(
      database
        .select({ categoryId: events.categoryId })
        .from(events)
        .all()
        .every((event) => event.categoryId === CATEGORY_ID)
    ).toBe(true);
    await expect(repository.softDelete(CATEGORY_ID)).resolves.toEqual({
      affectedEventIds: [],
    });
  });

  it('rejects deletion of an unknown category', async () => {
    await expect(
      repository.softDelete('missing-category')
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});
