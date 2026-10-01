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
      {
        metadata: { ...developmentTag, displayName: developmentTag.name },
        eventCount: 0,
      },
      {
        metadata: { ...localFirstTag, displayName: localFirstTag.name },
        eventCount: 0,
      },
    ]);
  });

  it('creates normalized tags with repository-owned IDs and timestamps', async () => {
    const { database, repository } = createRepository();

    const created = await repository.create({ name: '  data   ownership  ' });

    expect(created).toEqual({
      id: '90000000-0000-4000-8000-000000000001',
      name: 'data ownership',
      displayName: 'data ownership',
      createdAt: '2026-07-30T10:00:00.000Z',
      updatedAt: '2026-07-30T10:00:00.000Z',
      deletedAt: null,
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

  it('tombstones a tag while preserving relationships and events', async () => {
    const { database, repository } = createRepository();
    const tagId = DEVELOPMENT_SEED.tags[0].id;
    const affectedIds = [...database.eventTags.values()]
      .filter((relationship) => relationship.tagId === tagId)
      .map((relationship) => relationship.eventId)
      .sort();
    const unrelatedRelationships = [...database.eventTags.values()].filter(
      (relationship) => relationship.tagId !== tagId
    );
    const affectedEvent = database.events.get(affectedIds[0]!);
    database.events.set(affectedIds[0]!, {
      ...affectedEvent!,
      deletedAt: '2026-08-01T10:00:00.000Z',
    });

    const relationsBefore = structuredClone([...database.eventTags.entries()]);
    const eventsBefore = structuredClone([...database.events.entries()]);
    const result = await repository.softDelete(tagId);

    expect(result.affectedEventIds).toEqual(affectedIds);
    expect(database.tags.get(tagId)).toMatchObject({
      updatedAt: '2026-07-30T10:00:00.000Z',
      deletedAt: '2026-07-30T10:00:00.000Z',
    });
    await expect(repository.getById(tagId)).resolves.toBeNull();
    expect([...database.eventTags.entries()]).toEqual(relationsBefore);
    expect([...database.events.entries()]).toEqual(eventsBefore);
    expect(
      [...database.eventTags.values()].filter(
        (relationship) => relationship.tagId !== tagId
      )
    ).toEqual(unrelatedRelationships);
    await expect(repository.softDelete(tagId)).resolves.toEqual({
      affectedEventIds: [],
    });
    expect(database.events.get(affectedIds[0]!)?.deletedAt).toBe(
      '2026-08-01T10:00:00.000Z'
    );
  });

  it('deletes unused tags and rejects missing IDs without changes', async () => {
    const { database, repository } = createRepository();
    const unused = await repository.create({ name: 'unused' });

    await expect(repository.softDelete(unused.id)).resolves.toEqual({
      affectedEventIds: [],
    });

    const relationshipsBefore = [...database.eventTags.entries()];
    await expect(repository.softDelete('missing-tag')).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    expect([...database.eventTags.entries()]).toEqual(relationshipsBefore);
  });
});
