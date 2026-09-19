import { recordSealedCreation } from '../testing/recordSealedCreation';
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
import { events, eventTags, tags } from '../schema';
import { createTestDatabase } from '../testing/createTestDatabase';
import { SQLiteTagRepository } from './SQLiteTagRepository';
import { SQLiteEventRepository } from './SQLiteEventRepository';

const NOW = '2026-08-18T10:00:00.000Z';
const TAG_ID = '10000000-0000-4000-8000-000000000001';
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
      normalizedTitle: id.toLowerCase(),
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

function attachTag(
  database: AppDatabase,
  eventId: string,
  tagId: string,
  deletedAt: string | null = null
) {
  database
    .insert(eventTags)
    .values({
      eventId,
      tagId,
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
      deletedAt,
    })
    .run();
}

describe('SQLiteTagRepository', () => {
  let sqlite: Database;
  let database: AppDatabase;
  let repository: SQLiteTagRepository;

  beforeEach(async () => {
    ({ sqlite, database } = await createTestDatabase({
      initializeSyncState: true,
    }));
    repository = new SQLiteTagRepository(database, dependencies);
    database
      .insert(tags)
      .values({
        id: TAG_ID,
        name: 'Family',
        normalizedName: 'family',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        deletedAt: null,
      })
      .run();
  });

  afterEach(() => sqlite.close());

  it('creates, reads, searches, and updates tags', async () => {
    const created = await repository.create({ name: '  Big   Trips ' });

    expect(created).toEqual({
      id: GENERATED_ID,
      name: 'Big Trips',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
    await expect(repository.getById(GENERATED_ID)).resolves.toEqual(created);
    await expect(repository.list({ search: ' trips ' })).resolves.toEqual([
      created,
    ]);
    await expect(
      repository.update(GENERATED_ID, { name: 'Travel' })
    ).resolves.toMatchObject({
      name: 'Travel',
      updatedAt: NOW,
    });
  });

  it('validates names, uniqueness, missing IDs, and generated IDs', async () => {
    await expect(repository.create({ name: '   ' })).rejects.toBeInstanceOf(
      ModelValidationError
    );
    await expect(repository.create({ name: 'FAMILY' })).rejects.toBeInstanceOf(
      DuplicateNameError
    );
    await expect(
      repository.update('missing-tag', { name: 'Missing' })
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await repository.create({ name: 'Travel' });
    await expect(repository.create({ name: 'Work' })).rejects.toBeInstanceOf(
      RepositoryError
    );
  });

  it('counts only active relationships to active events', async () => {
    await repository.create({ name: 'Travel' });
    insertEvent(database, 'event-1');
    insertEvent(database, 'event-2');
    insertEvent(database, 'deleted-event', NOW);
    attachTag(database, 'event-1', TAG_ID);
    attachTag(database, 'event-2', GENERATED_ID);
    attachTag(database, 'deleted-event', TAG_ID);
    attachTag(database, 'event-2', TAG_ID, NOW);

    await expect(repository.listWithUsage()).resolves.toMatchObject([
      { metadata: { name: 'Family' }, eventCount: 1 },
      { metadata: { name: 'Travel' }, eventCount: 1 },
    ]);
  });

  it('tombstones the tag while preserving relationships and events', async () => {
    insertEvent(database, 'event-1');
    insertEvent(database, 'event-2');
    attachTag(database, 'event-1', TAG_ID);
    attachTag(database, 'event-2', TAG_ID, '2026-08-02T10:00:00.000Z');

    const originalRelations = database.select().from(eventTags).all();
    const originalEvents = database.select().from(events).all();
    const eventRepository = new SQLiteEventRepository(database, dependencies);
    await expect(
      eventRepository.getDetailsById('event-1')
    ).resolves.toMatchObject({
      tags: [expect.objectContaining({ id: TAG_ID })],
    });

    recordSealedCreation(database, 'tag', TAG_ID);
    await expect(repository.softDelete(TAG_ID)).resolves.toEqual({
      affectedEventIds: ['event-1'],
    });
    await expect(repository.getById(TAG_ID)).resolves.toBeNull();
    expect(database.select().from(eventTags).where(undefined).all()).toEqual([
      expect.objectContaining({
        eventId: 'event-1',
        tagId: TAG_ID,
        deletedAt: null,
        updatedAt: '2026-08-01T10:00:00.000Z',
      }),
      expect.objectContaining({
        eventId: 'event-2',
        tagId: TAG_ID,
        deletedAt: '2026-08-02T10:00:00.000Z',
      }),
    ]);
    expect(database.select().from(events).all()).toEqual([
      expect.objectContaining({
        id: 'event-1',
        updatedAt: '2026-08-01T10:00:00.000Z',
      }),
      expect.objectContaining({
        id: 'event-2',
        updatedAt: '2026-08-01T10:00:00.000Z',
      }),
    ]);
    expect(database.select().from(eventTags).all()).toEqual(originalRelations);
    expect(database.select().from(events).all()).toEqual(originalEvents);
    await expect(
      eventRepository.getDetailsById('event-1')
    ).resolves.toMatchObject({
      tags: [],
    });
    await expect(repository.listWithUsage()).resolves.toEqual([]);
    await expect(repository.softDelete(TAG_ID)).resolves.toEqual({
      affectedEventIds: [],
    });
  });

  it('rejects deletion of an unknown tag', async () => {
    await expect(repository.softDelete('missing-tag')).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });
});
