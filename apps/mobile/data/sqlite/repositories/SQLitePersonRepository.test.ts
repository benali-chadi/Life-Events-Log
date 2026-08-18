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
import { eventPeople, events, people } from '../schema';
import { createTestDatabase } from '../testing/createTestDatabase';
import { SQLitePersonRepository } from './SQLitePersonRepository';

const NOW = '2026-08-18T10:00:00.000Z';
const PERSON_ID = '10000000-0000-4000-8000-000000000001';
const GENERATED_ID = '90000000-0000-4000-8000-000000000001';

const dependencies: RepositoryDependencies = {
  createId: () => GENERATED_ID,
  now: () => NOW,
};

function insertEvent(
  database: AppDatabase,
  id: string,
  deletedAt: string | null = null
) {
  database
    .insert(events)
    .values({
      id,
      title: id,
      date: '2026-08-18',
      time: null,
      significance: 'ordinary',
      categoryId: null,
      locationId: null,
      notes: '',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
      deletedAt,
    })
    .run();
}

function attachPerson(
  database: AppDatabase,
  eventId: string,
  personId: string,
  deletedAt: string | null = null
) {
  database
    .insert(eventPeople)
    .values({
      eventId,
      personId,
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
      deletedAt,
    })
    .run();
}

describe('SQLitePersonRepository', () => {
  let sqlite: Database;
  let database: AppDatabase;
  let repository: SQLitePersonRepository;

  beforeEach(async () => {
    ({ sqlite, database } = await createTestDatabase());
    repository = new SQLitePersonRepository(database, dependencies);
    database
      .insert(people)
      .values({
        id: PERSON_ID,
        name: 'Leila',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        deletedAt: null,
      })
      .run();
  });

  afterEach(() => sqlite.close());

  it('creates, reads, searches, and updates people', async () => {
    const created = await repository.create({ name: '  Omar   Alaoui ' });

    expect(created).toEqual({
      id: GENERATED_ID,
      name: 'Omar Alaoui',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
    await expect(repository.getById(GENERATED_ID)).resolves.toEqual(created);
    await expect(repository.list({ search: ' alaoui ' })).resolves.toEqual([
      created,
    ]);
    await expect(
      repository.update(GENERATED_ID, { name: 'Omar' })
    ).resolves.toMatchObject({ name: 'Omar', updatedAt: NOW });
  });

  it('validates names, uniqueness, missing IDs, and generated IDs', async () => {
    await expect(repository.create({ name: '   ' })).rejects.toBeInstanceOf(
      ModelValidationError
    );
    await expect(repository.create({ name: 'LEILA' })).rejects.toBeInstanceOf(
      DuplicateNameError
    );
    await expect(
      repository.update('missing-person', { name: 'Missing' })
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await repository.create({ name: 'Omar' });
    await expect(repository.create({ name: 'Sara' })).rejects.toBeInstanceOf(
      RepositoryError
    );
  });

  it('counts only active relationships to active events', async () => {
    await repository.create({ name: 'Omar' });
    insertEvent(database, 'event-1');
    insertEvent(database, 'event-2');
    insertEvent(database, 'deleted-event', NOW);
    attachPerson(database, 'event-1', PERSON_ID);
    attachPerson(database, 'event-2', GENERATED_ID);
    attachPerson(database, 'deleted-event', PERSON_ID);
    attachPerson(database, 'event-2', PERSON_ID, NOW);

    await expect(repository.listWithUsage()).resolves.toMatchObject([
      { metadata: { name: 'Leila' }, eventCount: 1 },
      { metadata: { name: 'Omar' }, eventCount: 1 },
    ]);
  });

  it('tombstones the person and active relationships transactionally', async () => {
    insertEvent(database, 'event-1');
    insertEvent(database, 'event-2');
    attachPerson(database, 'event-1', PERSON_ID);
    attachPerson(database, 'event-2', PERSON_ID, '2026-08-02T10:00:00.000Z');

    await expect(repository.softDelete(PERSON_ID)).resolves.toEqual({
      affectedEventIds: ['event-1'],
    });
    await expect(repository.getById(PERSON_ID)).resolves.toBeNull();
    expect(database.select().from(eventPeople).all()).toEqual([
      expect.objectContaining({
        eventId: 'event-1',
        personId: PERSON_ID,
        deletedAt: NOW,
        updatedAt: NOW,
      }),
      expect.objectContaining({
        eventId: 'event-2',
        personId: PERSON_ID,
        deletedAt: '2026-08-02T10:00:00.000Z',
      }),
    ]);
    expect(database.select().from(events).all()).toEqual([
      expect.objectContaining({ id: 'event-1', updatedAt: NOW }),
      expect.objectContaining({
        id: 'event-2',
        updatedAt: '2026-08-01T10:00:00.000Z',
      }),
    ]);
    await expect(repository.softDelete(PERSON_ID)).resolves.toEqual({
      affectedEventIds: [],
    });
  });

  it('rejects deletion of an unknown person', async () => {
    await expect(
      repository.softDelete('missing-person')
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });
});
