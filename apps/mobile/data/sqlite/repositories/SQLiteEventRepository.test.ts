import type { Database } from 'sql.js';
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

  beforeEach(async () => {
    ({ sqlite, database } = await createTestDatabase());
    repository = new SQLiteEventRepository(database, dependencies);
    database
      .insert(categories)
      .values({
        id: CATEGORY_ID,
        name: 'Personal',
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
          createdAt: NOW,
          updatedAt: NOW,
          deletedAt: null,
        },
        {
          id: OTHER_TAG_ID,
          name: 'Travel',
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
        relativePath: 'attachments/a.jpg',
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

    const pageOne = await repository.list({ limit: 1 });
    const pageTwo = await repository.list({
      limit: 1,
      cursor: pageOne.nextCursor!,
    });
    expect(pageOne.items[0]?.event.id).toBe(EVENT_ID);
    expect(pageTwo.items[0]?.event.id).toBe('older');
  });

  it('soft deletes and restores without deleting owned rows', async () => {
    await repository.create(validInput());
    await repository.softDelete(EVENT_ID);
    await expect(repository.getById(EVENT_ID)).resolves.toBeNull();
    expect(database.select().from(eventTags).all()).toHaveLength(1);

    await repository.restore(EVENT_ID);
    await expect(repository.getById(EVENT_ID)).resolves.toMatchObject({
      deletedAt: null,
      updatedAt: NOW,
    });
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
