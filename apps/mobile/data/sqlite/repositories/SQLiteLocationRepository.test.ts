import type { Database } from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DuplicateNameError,
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type RepositoryDependencies,
} from '@/data/repositories';
import type { AppDatabase } from '../database';
import { events, locations } from '../schema';
import { createTestDatabase } from '../testing/createTestDatabase';
import { SQLiteLocationRepository } from './SQLiteLocationRepository';

const NOW = '2026-08-18T10:00:00.000Z';
const LOCATION_ID = '40000000-0000-4000-8000-000000000001';
const GENERATED_ID = '90000000-0000-4000-8000-000000000001';

const dependencies: RepositoryDependencies = {
  createId: () => GENERATED_ID,
  now: () => NOW,
};

function insertEvent(
  database: AppDatabase,
  {
    id,
    locationId,
    deletedAt = null,
  }: { id: string; locationId: string | null; deletedAt?: string | null }
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
      categoryId: null,
      locationId,
      notes: '',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt,
    })
    .run();
}

describe('SQLiteLocationRepository', () => {
  let sqlite: Database;
  let database: AppDatabase;
  let repository: SQLiteLocationRepository;

  beforeEach(async () => {
    ({ sqlite, database } = await createTestDatabase());
    repository = new SQLiteLocationRepository(database, dependencies);

    database
      .insert(locations)
      .values({
        id: LOCATION_ID,
        name: 'Rabat',
        normalizedName: 'rabat',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        deletedAt: null,
      })
      .run();
  });

  afterEach(() => sqlite.close());

  it('creates, reads, searches, and updates locations', async () => {
    const created = await repository.create({ name: '  Casablanca   Marina ' });

    expect(created).toEqual({
      id: GENERATED_ID,
      name: 'Casablanca Marina',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
    await expect(repository.getById(GENERATED_ID)).resolves.toEqual(created);
    await expect(repository.list({ search: '  marina ' })).resolves.toEqual([
      created,
    ]);

    const updated = await repository.update(GENERATED_ID, {
      name: 'Casablanca',
    });
    expect(updated).toMatchObject({ name: 'Casablanca', updatedAt: NOW });
  });

  it('validates names, active uniqueness, missing IDs, and generated IDs', async () => {
    await expect(repository.create({ name: '   ' })).rejects.toBeInstanceOf(
      ModelValidationError
    );
    await expect(repository.create({ name: 'RABAT' })).rejects.toBeInstanceOf(
      DuplicateNameError
    );
    await expect(
      repository.update('missing-location', { name: 'Missing' })
    ).rejects.toBeInstanceOf(EntityNotFoundError);

    await repository.create({ name: 'Casablanca' });
    await expect(
      repository.create({ name: 'Marrakesh' })
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('counts usage from active events and sorts by usage then name', async () => {
    await repository.create({ name: 'Casablanca' });
    insertEvent(database, { id: 'event-1', locationId: LOCATION_ID });
    insertEvent(database, { id: 'event-2', locationId: LOCATION_ID });
    insertEvent(database, { id: 'event-3', locationId: GENERATED_ID });
    insertEvent(database, {
      id: 'deleted-event',
      locationId: GENERATED_ID,
      deletedAt: NOW,
    });

    await expect(repository.listWithUsage()).resolves.toMatchObject([
      { metadata: { name: 'Rabat' }, eventCount: 2 },
      { metadata: { name: 'Casablanca' }, eventCount: 1 },
    ]);
  });

  it('tombstones locations, preserves references, and is idempotent', async () => {
    insertEvent(database, { id: 'event-1', locationId: LOCATION_ID });
    insertEvent(database, {
      id: 'deleted-event',
      locationId: LOCATION_ID,
      deletedAt: NOW,
    });

    await expect(repository.softDelete(LOCATION_ID)).resolves.toEqual({
      affectedEventIds: ['deleted-event', 'event-1'],
    });
    await expect(repository.getById(LOCATION_ID)).resolves.toBeNull();
    await expect(repository.list()).resolves.toEqual([]);
    expect(
      database
        .select({ locationId: events.locationId })
        .from(events)
        .all()
        .every((event) => event.locationId === LOCATION_ID)
    ).toBe(true);
    await expect(repository.softDelete(LOCATION_ID)).resolves.toEqual({
      affectedEventIds: [],
    });
  });

  it('rejects deletion of an unknown location', async () => {
    await expect(
      repository.softDelete('missing-location')
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});
