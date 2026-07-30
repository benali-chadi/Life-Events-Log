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
  it('lists active categories alphabetically and supports normalized search', async () => {
    const { database, repository } = createRepository();
    const personal = DEVELOPMENT_SEED.categories[0];

    database.categories.set(personal.id, {
      ...personal,
      deletedAt: '2026-07-30T09:00:00.000Z',
    });

    await expect(repository.list()).resolves.toMatchObject([
      { name: 'Projects' },
    ]);
    await expect(
      repository.list({ search: '  PROJECTS ' })
    ).resolves.toMatchObject([{ name: 'Projects' }]);
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

    await repository.softDelete(DEVELOPMENT_SEED.categories[0].id);

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

  it('soft deletes, restores, and reports missing or colliding IDs', async () => {
    const categoryId = DEVELOPMENT_SEED.categories[0].id;
    const { repository } = createRepository(createDependencies(categoryId));

    await repository.softDelete(categoryId);
    await expect(repository.getById(categoryId)).resolves.toBeNull();

    await repository.restore(categoryId);
    await expect(repository.getById(categoryId)).resolves.toMatchObject({
      id: categoryId,
      deletedAt: null,
    });

    await expect(
      repository.softDelete('missing-category')
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(
      repository.create({ name: 'Unique category', color: 'teal' })
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});
