import {
  DuplicateNameError,
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type RepositoryDependencies,
} from '@/data/repositories';
import type { CategoryColor } from '@/models';
import { describe, expect, it } from 'vitest';
import { createInMemoryDatabase } from '../createInMemoryDatabase';
import { DEVELOPMENT_SEED } from '../seed';
import { InMemoryCategoryRepository } from './InMemoryCategoryRepository';

function createDependencies(
  id = '90000000-0000-4000-8000-000000000001',
  timestamp = '2026-07-30T10:00:00.000Z'
): RepositoryDependencies {
  return {
    createId: () => id,
    now: () => timestamp,
  };
}

function createRepository(dependencies = createDependencies()) {
  const database = createInMemoryDatabase(DEVELOPMENT_SEED);

  return {
    database,
    repository: new InMemoryCategoryRepository(database, dependencies),
  };
}

describe('InMemoryCategoryRepository', () => {
  it('lists categories alphabetically and supports normalized search', async () => {
    const { repository } = createRepository();

    await expect(repository.list()).resolves.toMatchObject([
      { name: 'Personal' },
      { name: 'Projects' },
    ]);
    await expect(
      repository.list({ search: '  PROJECTS ' })
    ).resolves.toMatchObject([{ name: 'Projects' }]);
  });

  it('lists categories by active-event usage and then name', async () => {
    const { database, repository } = createRepository();
    const unusedCategory = {
      id: '10000000-0000-4000-8000-000000000099',
      name: 'Unused',
      color: 'slate' as const,
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-01T12:00:00.000Z',
      deletedAt: null,
    };
    database.categories.set(unusedCategory.id, unusedCategory);

    for (const [eventId, event] of database.events) {
      database.events.set(eventId, {
        ...event,
        deletedAt: '2026-08-01T10:00:00.000Z',
      });
    }

    for (const event of DEVELOPMENT_SEED.events.slice(0, 3)) {
      database.events.set(event.id, event);
    }

    const result = await repository.listWithUsage();

    expect(result).toMatchObject([
      { metadata: { name: 'Projects' }, eventCount: 2 },
      { metadata: { name: 'Personal' }, eventCount: 1 },
      { metadata: { name: 'Unused' }, eventCount: 0 },
    ]);
  });

  it('creates normalized categories with a validated color', async () => {
    const { database, repository } = createRepository();

    const created = await repository.create({
      name: '  Work   Projects ',
      color: 'violet',
    });

    expect(created).toEqual({
      id: '90000000-0000-4000-8000-000000000001',
      name: 'Work Projects',
      color: 'violet',
      createdAt: '2026-07-30T10:00:00.000Z',
      updatedAt: '2026-07-30T10:00:00.000Z',
      deletedAt: null,
    });
    expect(database.categories.get(created.id)).not.toBe(created);
  });

  it('applies partial updates and leaves empty updates unchanged', async () => {
    const { database, repository } = createRepository();
    const category = DEVELOPMENT_SEED.categories[0];

    const recolored = await repository.update(category.id, { color: 'rose' });

    expect(recolored).toMatchObject({
      name: category.name,
      color: 'rose',
      updatedAt: '2026-07-30T10:00:00.000Z',
    });

    const unchanged = await repository.update(category.id, {});

    expect(unchanged).toEqual(recolored);
    expect(database.categories.get(category.id)).not.toBe(unchanged);
  });

  it('enforces the same name rules as other metadata repositories', async () => {
    const { repository } = createRepository();

    await expect(
      repository.create({ name: '   ', color: 'blue' })
    ).rejects.toBeInstanceOf(ModelValidationError);
    await expect(
      repository.create({ name: ' projects ', color: 'green' })
    ).rejects.toBeInstanceOf(DuplicateNameError);

    await expect(
      repository.create({ name: 'PERSONAL', color: 'amber' })
    ).rejects.toBeInstanceOf(DuplicateNameError);
  });

  it('validates colors at runtime', async () => {
    const { repository } = createRepository();
    const invalidColor = 'ultraviolet' as CategoryColor;

    await expect(
      repository.create({ name: 'Invalid', color: invalidColor })
    ).rejects.toBeInstanceOf(ModelValidationError);
    await expect(
      repository.update(DEVELOPMENT_SEED.categories[0].id, {
        color: invalidColor,
      })
    ).rejects.toBeInstanceOf(ModelValidationError);
  });

  it('reports missing and colliding IDs', async () => {
    const categoryId = DEVELOPMENT_SEED.categories[0].id;
    const { repository } = createRepository(createDependencies(categoryId));

    await expect(
      repository.update('missing-category', { name: 'Missing' })
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(
      repository.create({ name: 'Unique category', color: 'teal' })
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('tombstones a category while preserving event references', async () => {
    const { database, repository } = createRepository();
    const categoryId = DEVELOPMENT_SEED.categories[0].id;
    const referencedEvents = [...database.events.values()].filter(
      (event) => event.categoryId === categoryId
    );
    const softDeletedEvent = referencedEvents[0];

    expect(softDeletedEvent).toBeDefined();
    database.events.set(softDeletedEvent!.id, {
      ...softDeletedEvent!,
      deletedAt: '2026-08-01T10:00:00.000Z',
    });

    const result = await repository.softDelete(categoryId);

    expect(database.categories.get(categoryId)).toMatchObject({
      updatedAt: '2026-07-30T10:00:00.000Z',
      deletedAt: '2026-07-30T10:00:00.000Z',
    });
    await expect(repository.getById(categoryId)).resolves.toBeNull();
    expect(result.affectedEventIds).toEqual(
      referencedEvents.map((event) => event.id).sort()
    );
    for (const eventId of result.affectedEventIds) {
      expect(database.events.get(eventId)?.categoryId).toBe(categoryId);
    }
    expect(database.events.get(softDeletedEvent!.id)?.deletedAt).toBe(
      '2026-08-01T10:00:00.000Z'
    );
  });

  it('tombstones unused categories and rejects missing IDs without changes', async () => {
    const { database, repository } = createRepository();
    const category = await repository.create({
      name: 'Unused',
      color: 'slate',
    });

    await expect(repository.softDelete(category.id)).resolves.toEqual({
      affectedEventIds: [],
    });
    expect(database.categories.get(category.id)?.deletedAt).toBe(
      '2026-07-30T10:00:00.000Z'
    );

    const eventsBefore = [...database.events.entries()];
    await expect(
      repository.softDelete('missing-category')
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    expect([...database.events.entries()]).toEqual(eventsBefore);
  });
});
