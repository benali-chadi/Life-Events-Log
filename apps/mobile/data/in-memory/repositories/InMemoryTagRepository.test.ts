import {
  DuplicateNameError,
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type RepositoryDependencies,
} from '@/data/repositories';
import { describe, expect, it } from 'vitest';
import { createInMemoryDatabase } from '../createInMemoryDatabase';
import { DEVELOPMENT_SEED } from '../seed';
import { InMemoryTagRepository } from './InMemoryTagRepository';

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
    repository: new InMemoryTagRepository(database, dependencies),
  };
}

describe('InMemoryTagRepository', () => {
  it('returns tags alphabetically and supports normalized search', async () => {
    const { repository } = createRepository();

    await expect(repository.list()).resolves.toMatchObject([
      { name: 'development' },
      { name: 'local-first' },
    ]);
    await expect(
      repository.list({ search: '  LOCAL-FIRST ' })
    ).resolves.toMatchObject([{ name: 'local-first' }]);
  });

  it('lists usage for active events, including unused tags', async () => {
    const { database, repository } = createRepository();
    const developmentTag = DEVELOPMENT_SEED.tags[0];
    const localFirstTag = DEVELOPMENT_SEED.tags[1];
    const projectStarted = DEVELOPMENT_SEED.events[0];

    database.events.set(projectStarted.id, {
      ...projectStarted,
      deletedAt: '2026-08-01T10:00:00.000Z',
    });

    await expect(repository.listWithUsage()).resolves.toEqual([
      { metadata: developmentTag, eventCount: 0 },
      { metadata: localFirstTag, eventCount: 0 },
    ]);
  });

  it('creates normalized tags with repository-owned IDs and timestamps', async () => {
    const { database, repository } = createRepository();

    const created = await repository.create({ name: '  data   ownership  ' });

    expect(created).toEqual({
      id: '90000000-0000-4000-8000-000000000001',
      name: 'data ownership',
      createdAt: '2026-07-30T10:00:00.000Z',
      updatedAt: '2026-07-30T10:00:00.000Z',
    });
    expect(database.tags.get(created.id)).not.toBe(created);
  });

  it('rejects empty names and case-insensitive duplicates', async () => {
    const { repository } = createRepository();

    await expect(repository.create({ name: '   ' })).rejects.toBeInstanceOf(
      ModelValidationError
    );
    await expect(
      repository.create({ name: ' DEVELOPMENT ' })
    ).rejects.toBeInstanceOf(DuplicateNameError);
  });

  it('updates tags without exposing stored objects', async () => {
    const { database, repository } = createRepository();
    const tagId = DEVELOPMENT_SEED.tags[0].id;

    const updated = await repository.update(tagId, {
      name: '  software   development ',
    });

    expect(updated.name).toBe('software development');
    expect(updated.updatedAt).toBe('2026-07-30T10:00:00.000Z');
    expect(updated.createdAt).toBe(DEVELOPMENT_SEED.tags[0].createdAt);

    updated.name = 'Mutated outside repository';

    expect(database.tags.get(tagId)?.name).toBe('software development');
  });

  it('rejects missing IDs and generated ID collisions', async () => {
    const { repository } = createRepository(
      createDependencies(DEVELOPMENT_SEED.tags[0].id)
    );

    await expect(
      repository.update('missing-tag', { name: 'Missing' })
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(
      repository.create({ name: 'new unique tag' })
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('exposes an explicit permanent-deletion placeholder', async () => {
    const { repository } = createRepository();

    await expect(
      repository.delete(DEVELOPMENT_SEED.tags[0].id)
    ).rejects.toThrow('Permanent tag deletion is not implemented yet.');
  });
});
