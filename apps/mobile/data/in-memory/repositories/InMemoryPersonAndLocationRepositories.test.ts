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
  it('uses the people table and shared named-metadata behavior', async () => {
    const database = createInMemoryDatabase(DEVELOPMENT_SEED);
    const repository = new InMemoryPersonRepository(database, dependencies);

    const created = await repository.create({ name: '  Chadi   A. ' });

    expect(created).toMatchObject({
      name: 'Chadi A.',
      createdAt: '2026-07-30T10:00:00.000Z',
      deletedAt: null,
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
    await expect(repository.softDelete('missing-person')).rejects.toEqual(
      expect.objectContaining<EntityNotFoundError>({
        name: 'EntityNotFoundError',
        message: 'Person with ID “missing-person” was not found.',
      })
    );
  });
});

describe('InMemoryLocationRepository', () => {
  it('uses the locations table and supports the full lifecycle', async () => {
    const database = createInMemoryDatabase(DEVELOPMENT_SEED);
    const repository = new InMemoryLocationRepository(database, dependencies);

    const created = await repository.create({ name: '  Casablanca  ' });
    const updated = await repository.update(created.id, {
      name: 'Casablanca Marina',
    });

    expect(database.locations.get(created.id)?.name).toBe('Casablanca Marina');
    expect(database.people.has(created.id)).toBe(false);
    expect(updated.updatedAt).toBe('2026-07-30T10:00:00.000Z');

    await repository.softDelete(created.id);
    await expect(repository.getById(created.id)).resolves.toBeNull();

    await repository.restore(created.id);
    await expect(repository.getById(created.id)).resolves.toMatchObject({
      name: 'Casablanca Marina',
      deletedAt: null,
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
});
