import {
  DuplicateNameError,
  EntityNotFoundError,
  type RepositoryDependencies,
} from '@/data/repositories';
import { describe, expect, it } from 'vitest';
import { createInMemoryDatabase } from '../createInMemoryDatabase';
import { DEVELOPMENT_SEED } from '../seed';
import { InMemoryLocationRepository } from './InMemoryLocationRepository';
import { InMemoryPersonRepository } from './InMemoryPersonRepository';

const dependencies: RepositoryDependencies = {
  createId: () => '90000000-0000-4000-8000-000000000001',
  now: () => '2026-07-30T10:00:00.000Z',
};

describe('InMemoryPersonRepository', () => {
  it('lists people by usage and then alphabetically', async () => {
    const database = createInMemoryDatabase(DEVELOPMENT_SEED);
    const repository = new InMemoryPersonRepository(database, dependencies);

    await expect(repository.listWithUsage()).resolves.toMatchObject([
      { metadata: { name: 'Salma' }, eventCount: 2 },
      { metadata: { name: 'Yassine' }, eventCount: 2 },
      { metadata: { name: 'Lina' }, eventCount: 1 },
      { metadata: { name: 'Mounir' }, eventCount: 1 },
    ]);
  });

  it('uses the people table and shared named-metadata behavior', async () => {
    const database = createInMemoryDatabase(DEVELOPMENT_SEED);
    const repository = new InMemoryPersonRepository(database, dependencies);

    const created = await repository.create({ name: '  Chadi   A. ' });

    expect(created).toMatchObject({
      name: 'Chadi A.',
      createdAt: '2026-07-30T10:00:00.000Z',
    });
    expect(database.people.get(created.id)).toEqual(created);
    expect(database.tags.has(created.id)).toBe(false);
    await expect(repository.list({ search: 'chadi a.' })).resolves.toEqual([
      created,
    ]);
  });

  it('reports person-specific repository errors', async () => {
    const database = createInMemoryDatabase(DEVELOPMENT_SEED);
    const repository = new InMemoryPersonRepository(database, dependencies);

    await expect(repository.create({ name: 'mounir' })).rejects.toEqual(
      expect.objectContaining<DuplicateNameError>({
        name: 'DuplicateNameError',
        message: 'Person named “mounir” already exists.',
      })
    );
    await expect(
      repository.update('missing-person', { name: 'Missing' })
    ).rejects.toEqual(
      expect.objectContaining<EntityNotFoundError>({
        name: 'EntityNotFoundError',
        message: 'Person with ID “missing-person” was not found.',
      })
    );
  });

  it('tombstones a person and its event relationships', async () => {
    const database = createInMemoryDatabase(DEVELOPMENT_SEED);
    const repository = new InMemoryPersonRepository(database, dependencies);
    const personId = DEVELOPMENT_SEED.people[1].id;
    const affectedIds = [...database.eventPeople.values()]
      .filter((relationship) => relationship.personId === personId)
      .map((relationship) => relationship.eventId)
      .sort();

    const result = await repository.softDelete(personId);

    expect(result.affectedEventIds).toEqual(affectedIds);
    expect(database.people.get(personId)).toMatchObject({
      updatedAt: '2026-07-30T10:00:00.000Z',
      deletedAt: '2026-07-30T10:00:00.000Z',
    });
    expect(
      [...database.eventPeople.values()]
        .filter((relationship) => relationship.personId === personId)
        .every(
          (relationship) =>
            relationship.deletedAt === '2026-07-30T10:00:00.000Z'
        )
    ).toBe(true);
    for (const eventId of affectedIds) {
      expect(database.events.get(eventId)?.updatedAt).toBe(
        '2026-07-30T10:00:00.000Z'
      );
    }
  });
});

describe('InMemoryLocationRepository', () => {
  it('lists all matching locations with active-event usage', async () => {
    const database = createInMemoryDatabase(DEVELOPMENT_SEED);
    const repository = new InMemoryLocationRepository(database, dependencies);

    await expect(
      repository.listWithUsage({ search: 'cinéma' })
    ).resolves.toMatchObject([
      { metadata: { name: 'Cinéma Renaissance' }, eventCount: 1 },
    ]);
  });

  it('uses the locations table and supports create and update', async () => {
    const database = createInMemoryDatabase(DEVELOPMENT_SEED);
    const repository = new InMemoryLocationRepository(database, dependencies);

    const created = await repository.create({ name: '  Casablanca  ' });
    const updated = await repository.update(created.id, {
      name: 'Casablanca Marina',
    });

    expect(database.locations.get(created.id)?.name).toBe('Casablanca Marina');
    expect(database.people.has(created.id)).toBe(false);
    expect(updated.updatedAt).toBe('2026-07-30T10:00:00.000Z');

    await expect(repository.getById(created.id)).resolves.toMatchObject({
      name: 'Casablanca Marina',
    });
  });

  it('reports location-specific duplicate errors', async () => {
    const database = createInMemoryDatabase(DEVELOPMENT_SEED);
    const repository = new InMemoryLocationRepository(database, dependencies);

    await expect(repository.create({ name: 'RABAT' })).rejects.toEqual(
      expect.objectContaining<DuplicateNameError>({
        name: 'DuplicateNameError',
        message: 'Location named “RABAT” already exists.',
      })
    );
  });

  it('tombstones a location while preserving event references', async () => {
    const database = createInMemoryDatabase(DEVELOPMENT_SEED);
    const repository = new InMemoryLocationRepository(database, dependencies);
    const locationId = DEVELOPMENT_SEED.locations[0].id;
    const affectedIds = [...database.events.values()]
      .filter((event) => event.locationId === locationId)
      .map((event) => event.id)
      .sort();

    const result = await repository.softDelete(locationId);

    expect(result.affectedEventIds).toEqual(affectedIds);
    expect(database.locations.get(locationId)).toMatchObject({
      updatedAt: '2026-07-30T10:00:00.000Z',
      deletedAt: '2026-07-30T10:00:00.000Z',
    });
    for (const eventId of affectedIds) {
      expect(database.events.get(eventId)?.locationId).toBe(locationId);
    }
  });

  it('rejects deletion of a missing location without changing events', async () => {
    const database = createInMemoryDatabase(DEVELOPMENT_SEED);
    const repository = new InMemoryLocationRepository(database, dependencies);
    const eventsBefore = [...database.events.entries()];

    await expect(
      repository.softDelete('missing-location')
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    expect([...database.events.entries()]).toEqual(eventsBefore);
  });
});
