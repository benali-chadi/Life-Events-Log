import type { Database } from 'sql.js';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type CreateEventInput,
  type RepositoryDependencies,
} from '@/data/repositories';
import type { AppDatabase } from '../database';
import {
  categories,
  eventAttachments,
  eventPeople,
  events,
  eventTags,
  locations,
  people,
  tags,
  syncOperations,
  syncPendingOperations,
  syncFieldVersions,
  syncFrontiers,
} from '../schema';
import { createTestDatabase } from '../testing/createTestDatabase';
import { SQLiteEventRepository } from './SQLiteEventRepository';

const NOW = '2026-08-18T10:00:00.000Z';
const EVENT_ID = '90000000-0000-4000-8000-000000000001';
const CATEGORY_ID = '10000000-0000-4000-8000-000000000001';
const LOCATION_ID = '20000000-0000-4000-8000-000000000001';
const TAG_ID = '30000000-0000-4000-8000-000000000001';
const OTHER_TAG_ID = '30000000-0000-4000-8000-000000000002';
const PERSON_ID = '40000000-0000-4000-8000-000000000001';

const dependencies: RepositoryDependencies = {
  createId: () => EVENT_ID,
  now: () => NOW,
};

function validInput(
  overrides: Partial<CreateEventInput> = {}
): CreateEventInput {
  return {
    title: '  Family   trip ',
    date: '2026-08-17',
    time: '14:30',
    significance: 'notable',
    categoryId: CATEGORY_ID,
    locationId: LOCATION_ID,
    notes: '**A lovely day** with everyone.',
    tagIds: [TAG_ID],
    peopleIds: [PERSON_ID],
    ...overrides,
  };
}

describe('SQLiteEventRepository', () => {
  let sqlite: Database;
  let database: AppDatabase;
  let repository: SQLiteEventRepository;
  let queries: string[];

  it('records remove/re-add transitions without duplicating unchanged active relations', async () => {
    await repository.create(validInput());
    await repository.update(EVENT_ID, {
      tagIds: [TAG_ID],
      peopleIds: [PERSON_ID],
    });
    expect(database.select().from(syncPendingOperations).all()).toHaveLength(3);
    await repository.update(EVENT_ID, { tagIds: [], peopleIds: [] });
    expect(database.select().from(eventTags).get()?.deletedAt).toBe(NOW);
    expect(database.select().from(eventPeople).get()?.deletedAt).toBe(NOW);
    await repository.update(EVENT_ID, {
      tagIds: [TAG_ID],
      peopleIds: [PERSON_ID],
    });
    expect(
      database
        .select()
        .from(syncPendingOperations)
        .all()
        .map((operation) => operation.operationType)
    ).toEqual(['entity.create', 'relation.add', 'relation.add']);
    expect(database.select().from(eventTags).get()).toMatchObject({
      createdAt: NOW,
      deletedAt: null,
    });
    expect(database.select().from(eventPeople).get()).toMatchObject({
      createdAt: NOW,
      deletedAt: null,
    });
  });

  it('records event creation and dependent relation additions in the same transaction', async () => {
    await repository.create(validInput());
    const operations = database.select().from(syncPendingOperations).all();
    expect(operations).toHaveLength(3);
    expect(
      operations.slice(1).map((operation) => operation.operationType)
    ).toEqual(['relation.add', 'relation.add']);
    expect(operations[0]).toMatchObject({
      operationType: 'entity.create',
      entityType: 'event',
      entityId: EVENT_ID,
      payload: { title: 'Family trip' },
    });
    expect(database.select().from(syncFieldVersions).all()).toEqual([]);
    expect(database.select().from(syncFrontiers).all()).toEqual([]);
    expect(database.select().from(syncOperations).all()).toEqual([]);
    expect(database.select().from(eventTags).all()).toHaveLength(1);
    expect(database.select().from(eventPeople).all()).toHaveLength(1);
  });

  beforeEach(async () => {
    queries = [];
    ({ sqlite, database } = await createTestDatabase({
      initializeSyncState: true,
      logger: {
        logQuery: (query) => queries.push(query),
      },
    }));
    repository = new SQLiteEventRepository(database, dependencies);
    database
      .insert(categories)
      .values({
        id: CATEGORY_ID,
        name: 'Personal',
        normalizedName: 'personal',
        color: 'green',
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      })
      .run();
    database
      .insert(locations)
      .values({
        id: LOCATION_ID,
        name: 'Rabat',
        normalizedName: 'rabat',
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      })
      .run();
    database
      .insert(tags)
      .values([
        {
          id: TAG_ID,
          name: 'Family',
          normalizedName: 'family',
          createdAt: NOW,
          updatedAt: NOW,
          deletedAt: null,
        },
        {
          id: OTHER_TAG_ID,
          name: 'Travel',
          normalizedName: 'travel',
          createdAt: NOW,
          updatedAt: NOW,
          deletedAt: null,
        },
      ])
      .run();
    database
      .insert(people)
      .values({
        id: PERSON_ID,
        name: 'Leila',
        normalizedName: 'leila',
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      })
      .run();
  });

  afterEach(() => sqlite.close());

  it('creates an event and its relationships atomically, then resolves details', async () => {
    const details = await repository.create(validInput());

    expect(details.event).toEqual({
      id: EVENT_ID,
      title: 'Family trip',
      date: '2026-08-17',
      time: '14:30',
      significance: 'notable',
      categoryId: CATEGORY_ID,
      locationId: LOCATION_ID,
      notes: '**A lovely day** with everyone.',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
    expect(details).toMatchObject({
      category: { name: 'Personal' },
      location: { name: 'Rabat' },
      tags: [{ name: 'Family' }],
      people: [{ name: 'Leila' }],
      attachments: [],
    });
    expect(database.select().from(eventTags).all()).toHaveLength(1);
    expect(database.select().from(eventPeople).all()).toHaveLength(1);
  });

  it('counts events using the same filters as the timeline list', async () => {
    await repository.create(validInput());

    await expect(repository.count({ limit: 10 })).resolves.toBe(1);
    await expect(
      repository.count({ limit: 10, search: 'family' })
    ).resolves.toBe(1);
    await expect(
      repository.count({ limit: 10, search: 'missing' })
    ).resolves.toBe(0);

    await repository.softDelete(EVENT_ID);
    await expect(repository.count({ limit: 10 })).resolves.toBe(0);
  });

  it('updates fields and tombstones/restores relationship rows', async () => {
    await repository.create(validInput());
    await repository.update(EVENT_ID, {
      title: 'Updated',
      tagIds: [OTHER_TAG_ID],
      peopleIds: [],
    });

    const details = await repository.getDetailsById(EVENT_ID);
    expect(details).toMatchObject({
      event: { title: 'Updated' },
      tags: [{ name: 'Travel' }],
      people: [],
    });
    expect(
      database
        .select({ value: events.normalizedTitle })
        .from(events)
        .where(eq(events.id, EVENT_ID))
        .get()?.value
    ).toBe('updated');
    expect(database.select().from(eventTags).all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tagId: TAG_ID, deletedAt: NOW }),
        expect.objectContaining({ tagId: OTHER_TAG_ID, deletedAt: null }),
      ])
    );
    expect(database.select().from(eventPeople).all()).toEqual([
      expect.objectContaining({ personId: PERSON_ID, deletedAt: NOW }),
    ]);

    await repository.update(EVENT_ID, { tagIds: [TAG_ID] });
    expect(database.select().from(eventTags).all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tagId: TAG_ID,
          createdAt: NOW,
          deletedAt: null,
        }),
        expect.objectContaining({ tagId: OTHER_TAG_ID, deletedAt: NOW }),
      ])
    );
  });

  it('lists filtered pages in timeline order with previews', async () => {
    await repository.create(validInput());
    database
      .insert(eventAttachments)
      .values({
        id: 'attachment-1',
        eventId: EVENT_ID,
        contentHash: 'a'.repeat(64),
        filename: 'a.jpg',
        mimeType: 'image/jpeg',
        width: 100,
        height: 100,
        fileSize: 1000,
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      })
      .run();
    database
      .insert(events)
      .values({
        id: 'older',
        title: 'Older',
        normalizedTitle: 'older',
        date: '2026-08-16',
        time: null,
        significance: 'ordinary',
        categoryId: null,
        locationId: null,
        notes: '',
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      })
      .run();

    queries = [];
    const first = await repository.list({
      search: 'family',
      tagIds: { ids: [TAG_ID] },
      limit: 1,
    });
    expect(first.items[0]).toMatchObject({
      event: { id: EVENT_ID, notesPreview: 'A lovely day with everyone.' },
      attachmentCount: 1,
      attachmentPreview: { id: 'attachment-1' },
    });
    expect(first.nextCursor).toBeNull();
    expect(queries).toHaveLength(1);

    const pageOne = await repository.list({ limit: 1 });
    const pageTwo = await repository.list({
      limit: 1,
      cursor: pageOne.nextCursor!,
    });
    expect(pageOne.items[0]?.event.id).toBe(EVENT_ID);
    expect(pageTwo.items[0]?.event.id).toBe('older');

    await repository.update(EVENT_ID, { title: 'ÉTÉ à Rabat' });
    const accentedSearch = await repository.list({ search: 'été', limit: 10 });
    expect(accentedSearch.items.map((item) => item.event.id)).toEqual([
      EVENT_ID,
    ]);
  });

  it('cancels an unsealed event and removes its owned rows', async () => {
    await repository.create(validInput());
    await repository.softDelete(EVENT_ID);
    await expect(repository.getById(EVENT_ID)).resolves.toBeNull();
    expect(database.select().from(eventTags).all()).toEqual([]);
    expect(database.select().from(eventPeople).all()).toEqual([]);
    expect(database.select().from(syncPendingOperations).all()).toEqual([]);
  });

  it('validates values and active references before writing', async () => {
    await expect(
      repository.create(validInput({ title: ' ' }))
    ).rejects.toBeInstanceOf(ModelValidationError);
    await expect(
      repository.create(validInput({ date: '2026-02-30' }))
    ).rejects.toBeInstanceOf(ModelValidationError);
    await expect(
      repository.create(validInput({ tagIds: [TAG_ID, TAG_ID] }))
    ).rejects.toBeInstanceOf(ModelValidationError);
    await expect(
      repository.create(validInput({ locationId: 'missing' }))
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(database.select().from(events).all()).toEqual([]);
  });

  it('rejects generated ID collisions and malformed list queries', async () => {
    await repository.create(validInput());
    await expect(
      repository.create(validInput({ title: 'Another' }))
    ).rejects.toBeInstanceOf(RepositoryError);
    await expect(repository.list({ limit: 0 })).rejects.toBeInstanceOf(
      ModelValidationError
    );
    await expect(
      repository.list({ limit: 10, cursor: 'bad' })
    ).rejects.toBeInstanceOf(ModelValidationError);
  });
});
