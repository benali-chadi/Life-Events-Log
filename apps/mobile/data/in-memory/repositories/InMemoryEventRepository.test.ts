import {
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type CreateEventInput,
  type EventListQuery,
  type RepositoryDependencies,
} from '@/data/repositories';
import type {
  EventAttachment,
  EventSignificance,
  LELEvent,
  LocalDate,
  LocalTime,
} from '@/models';
import { EVENT_TITLE_MAX_LENGTH } from '@/models';
import { describe, expect, it } from 'vitest';
import { createInMemoryDatabase } from '../createInMemoryDatabase';
import { eventPersonKey, eventTagKey } from '../relationshipKeys';
import { DEVELOPMENT_SEED } from '../seed';
import { InMemoryEventRepository } from './InMemoryEventRepository';

const NEW_EVENT_ID = '90000000-0000-4000-8000-000000000001';
const NOW = '2026-07-30T10:00:00.000Z';

function createDependencies(id = NEW_EVENT_ID): RepositoryDependencies {
  return {
    createId: () => id,
    now: () => NOW,
  };
}

function createRepository(dependencies = createDependencies()) {
  const database = createInMemoryDatabase(DEVELOPMENT_SEED);

  return {
    database,
    repository: new InMemoryEventRepository(database, dependencies),
  };
}

function validInput(
  overrides: Partial<CreateEventInput> = {}
): CreateEventInput {
  return {
    title: '  A new   chapter ',
    date: '2026-07-30',
    time: '15:45',
    significance: 'major',
    categoryId: DEVELOPMENT_SEED.categories[0].id,
    locationId: DEVELOPMENT_SEED.locations[0].id,
    notes: '**Remember this.**',
    tagIds: [DEVELOPMENT_SEED.tags[0].id],
    peopleIds: [DEVELOPMENT_SEED.people[0].id],
    ...overrides,
  };
}

function timelineEvent(
  id: string,
  date: LocalDate,
  time: LocalTime | null,
  createdAt: string,
  overrides: Partial<LELEvent> = {}
): LELEvent {
  return {
    id,
    title: id,
    date,
    time,
    significance: 'ordinary',
    categoryId: null,
    locationId: null,
    notes: '',
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  };
}

describe('InMemoryEventRepository', () => {
  it('creates an event and its relationships as one detailed result', async () => {
    const { database, repository } = createRepository();

    const details = await repository.create(validInput());

    expect(details.event).toEqual({
      id: NEW_EVENT_ID,
      title: 'A new chapter',
      date: '2026-07-30',
      time: '15:45',
      significance: 'major',
      categoryId: DEVELOPMENT_SEED.categories[0].id,
      locationId: DEVELOPMENT_SEED.locations[0].id,
      notes: '**Remember this.**',
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
    expect(details.category?.name).toBe('Personal');
    expect(details.location?.name).toBe('Rabat');
    expect(details.tags.map((tag) => tag.name)).toEqual(['development']);
    expect(details.people.map((person) => person.name)).toEqual(['Mounir']);
    expect(
      database.eventTags.has(
        eventTagKey(NEW_EVENT_ID, DEVELOPMENT_SEED.tags[0].id)
      )
    ).toBe(true);
    expect(
      database.eventPeople.has(
        eventPersonKey(NEW_EVENT_ID, DEVELOPMENT_SEED.people[0].id)
      )
    ).toBe(true);

    details.event.title = 'External mutation';
    const [returnedTag] = details.tags;

    if (!returnedTag) throw new Error('Expected the created event tag.');

    returnedTag.name = 'External mutation';

    expect(database.events.get(NEW_EVENT_ID)?.title).toBe('A new chapter');
    expect(database.tags.get(DEVELOPMENT_SEED.tags[0].id)?.name).toBe(
      'development'
    );
  });

  it('accepts a title at the character limit', async () => {
    const { repository } = createRepository();
    const title = 'a'.repeat(EVENT_TITLE_MAX_LENGTH);

    await expect(
      repository.create(validInput({ title }))
    ).resolves.toMatchObject({
      event: { title },
    });
  });

  it.each([
    ['empty title', { title: '   ' }],
    ['title over the limit', { title: 'a'.repeat(EVENT_TITLE_MAX_LENGTH + 1) }],
    ['impossible date', { date: '2026-02-29' as LocalDate }],
    ['malformed date', { date: '2026-2-03' as LocalDate }],
    ['invalid time', { time: '24:00' as LocalTime }],
    ['invalid significance', { significance: 'historic' as EventSignificance }],
  ])('rejects an %s without changing the database', async (_, override) => {
    const { database, repository } = createRepository();
    const eventCount = database.events.size;

    await expect(
      repository.create(validInput(override))
    ).rejects.toBeInstanceOf(ModelValidationError);
    expect(database.events.size).toBe(eventCount);
    expect(database.eventTags.has(eventTagKey(NEW_EVENT_ID, 'anything'))).toBe(
      false
    );
  });

  it('rejects missing and duplicate metadata references atomically', async () => {
    const { database, repository } = createRepository();
    const eventCount = database.events.size;

    await expect(
      repository.create(validInput({ tagIds: ['missing-tag'] }))
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(
      repository.create(validInput({ peopleIds: ['missing-person'] }))
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(
      repository.create(
        validInput({
          tagIds: [DEVELOPMENT_SEED.tags[1].id, DEVELOPMENT_SEED.tags[1].id],
        })
      )
    ).rejects.toBeInstanceOf(ModelValidationError);

    expect(database.events.size).toBe(eventCount);
    expect(
      database.eventTags.has(eventTagKey(NEW_EVENT_ID, 'missing-tag'))
    ).toBe(false);
  });

  it('applies partial scalar and relationship updates with replacement semantics', async () => {
    const { database, repository } = createRepository();
    const eventId = DEVELOPMENT_SEED.events[0].id;

    const updated = await repository.update(eventId, {
      title: '  Renamed   event ',
      tagIds: [],
      peopleIds: [DEVELOPMENT_SEED.people[0].id],
    });

    expect(updated.event).toMatchObject({
      title: 'Renamed event',
      notes: DEVELOPMENT_SEED.events[0].notes,
      updatedAt: NOW,
    });
    expect(updated.tags).toEqual([]);
    expect(updated.people.map((person) => person.name)).toEqual(['Mounir']);
    expect(
      [...database.eventTags.values()].filter(
        (relationship) => relationship.eventId === eventId
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deletedAt: NOW }),
        expect.objectContaining({ deletedAt: NOW }),
      ])
    );
  });

  it('restores a tombstoned relationship without replacing its identity', async () => {
    const { database, repository } = createRepository();
    const eventId = DEVELOPMENT_SEED.events[0].id;
    const tagId = DEVELOPMENT_SEED.tags[0].id;
    const key = eventTagKey(eventId, tagId);
    const createdAt = database.eventTags.get(key)?.createdAt;

    await repository.update(eventId, { tagIds: [] });
    expect(database.eventTags.get(key)?.deletedAt).toBe(NOW);

    await repository.update(eventId, { tagIds: [tagId] });
    expect(database.eventTags.get(key)).toMatchObject({
      createdAt,
      updatedAt: NOW,
      deletedAt: null,
    });
  });

  it('does not partially update an event when relationship validation fails', async () => {
    const { database, repository } = createRepository();
    const event = DEVELOPMENT_SEED.events[0];
    const relationshipsBefore = [...database.eventTags.entries()];

    await expect(
      repository.update(event.id, {
        title: 'This must not be stored',
        tagIds: ['missing-tag'],
      })
    ).rejects.toBeInstanceOf(EntityNotFoundError);

    expect(database.events.get(event.id)).toEqual(event);
    expect([...database.eventTags.entries()]).toEqual(relationshipsBefore);
  });

  it('resolves related records and orders attachments', async () => {
    const { database, repository } = createRepository();
    const eventId = DEVELOPMENT_SEED.events[0].id;
    const attachmentBase = {
      eventId,
      contentHash: 'a'.repeat(64),
      filename: 'image.jpg',
      mimeType: 'image/jpeg',
      width: 100,
      height: 100,
      fileSize: 1_000,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    } satisfies Omit<EventAttachment, 'id' | 'sortOrder'>;

    database.attachments.set('attachment-2', {
      ...attachmentBase,
      id: 'attachment-2',
      sortOrder: 2,
    });
    database.attachments.set('attachment-1', {
      ...attachmentBase,
      id: 'attachment-1',
      sortOrder: 1,
    });
    const details = await repository.getDetailsById(eventId);

    expect(details?.tags.map((item) => item.name)).toEqual([
      'development',
      'local-first',
    ]);
    expect(details?.attachments.map((item) => item.id)).toEqual([
      'attachment-1',
      'attachment-2',
    ]);
  });

  it('soft deletes and restores events without removing relationships', async () => {
    const { database, repository } = createRepository();
    const eventId = DEVELOPMENT_SEED.events[0].id;
    const relationshipCount = database.eventTags.size;

    await repository.softDelete(eventId);

    await expect(repository.getById(eventId)).resolves.toBeNull();
    await expect(repository.getDetailsById(eventId)).resolves.toBeNull();
    expect(database.eventTags.size).toBe(relationshipCount);

    await repository.restore(eventId);

    await expect(repository.getById(eventId)).resolves.toMatchObject({
      id: eventId,
      deletedAt: null,
      updatedAt: NOW,
    });
    expect(database.eventTags.size).toBe(relationshipCount);
  });

  it('soft deletes many events after validating the full selection', async () => {
    const { database, repository } = createRepository();
    const eventIds = DEVELOPMENT_SEED.events
      .slice(0, 2)
      .map((event) => event.id);

    await repository.softDeleteMany([...eventIds, eventIds[0]!]);

    eventIds.forEach((id) => {
      expect(database.events.get(id)).toMatchObject({
        deletedAt: NOW,
        updatedAt: NOW,
      });
    });

    const activeEventId = DEVELOPMENT_SEED.events[2]!.id;
    await expect(
      repository.softDeleteMany([activeEventId, 'missing-event'])
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(database.events.get(activeEventId)?.deletedAt).toBeNull();
  });

  it('rejects missing event IDs and generated ID collisions', async () => {
    const existingId = DEVELOPMENT_SEED.events[0].id;
    const { repository } = createRepository(createDependencies(existingId));

    await expect(repository.update('missing-event', {})).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    await expect(repository.softDelete('missing-event')).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    await expect(repository.create(validInput())).rejects.toBeInstanceOf(
      RepositoryError
    );
  });

  it('lists events newest-first with timed events above date-only events', async () => {
    const events = [
      timelineEvent(
        'date-only-new-day',
        '2026-08-01',
        null,
        '2026-08-02T10:00:00Z'
      ),
      timelineEvent(
        'date-only-new',
        '2026-07-30',
        null,
        '2026-07-30T12:00:00Z'
      ),
      timelineEvent('morning', '2026-07-30', '08:00', '2026-07-30T13:00:00Z'),
      timelineEvent('evening', '2026-07-30', '20:00', '2026-07-30T11:00:00Z'),
      timelineEvent(
        'date-only-old',
        '2026-07-30',
        null,
        '2026-07-30T10:00:00Z'
      ),
      timelineEvent('older', '2026-07-29', '23:00', '2026-07-29T23:00:00Z'),
      timelineEvent('deleted', '2026-08-02', '12:00', '2026-08-02T12:00:00Z', {
        deletedAt: NOW,
      }),
    ];
    const database = createInMemoryDatabase({ events });
    const repository = new InMemoryEventRepository(
      database,
      createDependencies()
    );

    const page = await repository.list({ limit: 20 });

    expect(page.items.map((item) => item.event.id)).toEqual([
      'date-only-new-day',
      'evening',
      'morning',
      'date-only-new',
      'date-only-old',
      'older',
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('paginates with an opaque keyset cursor without gaps or duplicates', async () => {
    const events = [
      timelineEvent('four', '2026-07-30', null, '2026-07-30T10:00:00Z'),
      timelineEvent('one', '2026-08-02', null, '2026-08-02T10:00:00Z'),
      timelineEvent('three', '2026-07-31', null, '2026-07-31T10:00:00Z'),
      timelineEvent('two', '2026-08-01', null, '2026-08-01T10:00:00Z'),
      timelineEvent('five', '2026-07-29', null, '2026-07-29T10:00:00Z'),
    ];
    const database = createInMemoryDatabase({ events });
    const repository = new InMemoryEventRepository(
      database,
      createDependencies()
    );

    const first = await repository.list({ limit: 2 });
    const second = await repository.list({
      limit: 2,
      cursor: first.nextCursor!,
    });
    const third = await repository.list({
      limit: 2,
      cursor: second.nextCursor!,
    });

    expect(
      [...first.items, ...second.items, ...third.items].map(
        (item) => item.event.id
      )
    ).toEqual(['one', 'two', 'three', 'four', 'five']);
    expect(first.nextCursor).not.toBeNull();
    expect(second.nextCursor).not.toBeNull();
    expect(third.nextCursor).toBeNull();
  });

  it('combines scalar filters and uses inclusive date boundaries', async () => {
    const { repository } = createRepository();
    const project = DEVELOPMENT_SEED.events[0];

    const page = await repository.list({
      limit: 10,
      search: '  LIFE   EVENTS ',
      significance: ['turning-point', 'major'],
      categoryIds: project.categoryId ? [project.categoryId] : [],
      locationIds: project.locationId ? [project.locationId] : [],
      dateFrom: project.date,
      dateTo: project.date,
    });

    expect(page.items.map((item) => item.event.id)).toEqual([project.id]);

    const uncategorizedDatabase = createInMemoryDatabase({
      events: [
        timelineEvent('uncategorized', '2026-07-30', null, NOW),
        timelineEvent('categorized', '2026-07-30', null, NOW, {
          categoryId: DEVELOPMENT_SEED.categories[0].id,
        }),
      ],
      categories: DEVELOPMENT_SEED.categories,
    });
    const uncategorizedRepository = new InMemoryEventRepository(
      uncategorizedDatabase,
      createDependencies()
    );

    await expect(
      uncategorizedRepository.list({
        limit: 10,
        includeUncategorized: true,
      })
    ).resolves.toMatchObject({
      items: [{ event: { id: 'uncategorized' } }],
    });
  });

  it('combines selected category and location IDs with missing values', async () => {
    const categoryId = DEVELOPMENT_SEED.categories[0].id;
    const locationId = DEVELOPMENT_SEED.locations[0].id;
    const database = createInMemoryDatabase({
      events: [
        timelineEvent('selected', '2026-07-30', null, NOW, {
          categoryId,
          locationId,
        }),
        timelineEvent('missing', '2026-07-30', null, NOW),
        timelineEvent('other', '2026-07-30', null, NOW, {
          categoryId: DEVELOPMENT_SEED.categories[1].id,
          locationId: DEVELOPMENT_SEED.locations[1].id,
        }),
      ],
      categories: DEVELOPMENT_SEED.categories,
      locations: DEVELOPMENT_SEED.locations,
    });
    const repository = new InMemoryEventRepository(
      database,
      createDependencies()
    );

    await expect(
      repository.list({ limit: 10, includeWithoutLocation: true })
    ).resolves.toMatchObject({
      items: [{ event: { id: 'missing' } }],
    });

    const page = await repository.list({
      limit: 10,
      categoryIds: [categoryId],
      includeUncategorized: true,
      locationIds: [locationId],
      includeWithoutLocation: true,
    });

    expect(page.items.map((item) => item.event.id)).toEqual([
      'missing',
      'selected',
    ]);
  });

  it('supports one-sided, inclusive, and overnight time ranges', async () => {
    const database = createInMemoryDatabase({
      events: [
        timelineEvent('unknown', '2026-07-30', null, NOW),
        timelineEvent('late', '2026-07-30', '23:00', NOW),
        timelineEvent('evening-boundary', '2026-07-30', '22:00', NOW),
        timelineEvent('afternoon', '2026-07-30', '15:00', NOW),
        timelineEvent('morning', '2026-07-30', '09:00', NOW),
        timelineEvent('night-boundary', '2026-07-30', '02:00', NOW),
      ],
    });
    const repository = new InMemoryEventRepository(
      database,
      createDependencies()
    );
    const idsFor = async (query: Omit<EventListQuery, 'limit'>) =>
      (await repository.list({ ...query, limit: 20 })).items.map(
        (item) => item.event.id
      );

    await expect(idsFor({ timeFrom: '15:00' })).resolves.toEqual([
      'late',
      'evening-boundary',
      'afternoon',
    ]);
    await expect(idsFor({ timeTo: '09:00' })).resolves.toEqual([
      'morning',
      'night-boundary',
    ]);
    await expect(
      idsFor({ timeFrom: '09:00', timeTo: '15:00' })
    ).resolves.toEqual(['afternoon', 'morning']);
    await expect(
      idsFor({ timeFrom: '22:00', timeTo: '02:00' })
    ).resolves.toEqual(['late', 'evening-boundary', 'night-boundary']);
  });

  it('supports all and any matching independently for tags and people', async () => {
    const { repository } = createRepository();
    const projectId = DEVELOPMENT_SEED.events[0].id;
    const coffeeId = DEVELOPMENT_SEED.events[1].id;
    const tagIds = DEVELOPMENT_SEED.tags.map((tag) => tag.id);
    const firstTagId = DEVELOPMENT_SEED.tags[0].id;
    const personId = DEVELOPMENT_SEED.people[0].id;

    await expect(
      repository.list({
        limit: 10,
        tagIds: { ids: tagIds },
      })
    ).resolves.toMatchObject({
      items: [{ event: { id: projectId } }],
    });
    await expect(
      repository.list({
        limit: 10,
        tagIds: { ids: [firstTagId, 'missing-tag'], match: 'any' },
      })
    ).resolves.toMatchObject({
      items: [{ event: { id: projectId } }],
    });
    await expect(
      repository.list({
        limit: 10,
        tagIds: { ids: [firstTagId, 'missing-tag'], match: 'all' },
      })
    ).resolves.toMatchObject({ items: [] });
    await expect(
      repository.list({
        limit: 10,
        peopleIds: { ids: [personId] },
      })
    ).resolves.toMatchObject({
      items: [{ event: { id: coffeeId } }],
    });
  });

  it('builds lightweight notes and attachment previews', async () => {
    const { database, repository } = createRepository();
    const event = DEVELOPMENT_SEED.events[0];
    const stored = database.events.get(event.id);

    if (!stored) throw new Error('Expected seeded event.');

    database.events.set(event.id, {
      ...stored,
      notes: '**Bold** [documentation](https://example.com)\n- next step',
    });
    database.attachments.set('preview-attachment', {
      id: 'preview-attachment',
      eventId: event.id,
      contentHash: 'a'.repeat(64),
      filename: 'preview.jpg',
      mimeType: 'image/jpeg',
      width: 100,
      height: 100,
      fileSize: 1_000,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });

    const page = await repository.list({ limit: 10 });
    const item = page.items.find(
      (candidate) => candidate.event.id === event.id
    );

    expect(item?.event).not.toHaveProperty('notes');
    expect(item?.event.notesPreview).toBe('Bold documentation next step');
    expect(item?.attachmentCount).toBe(1);
    expect(item?.attachmentPreview?.id).toBe('preview-attachment');
  });

  it('rejects invalid list limits, ranges, modes, and cursors', async () => {
    const { repository } = createRepository();

    await expect(repository.list({ limit: 0 })).rejects.toBeInstanceOf(
      ModelValidationError
    );
    await expect(
      repository.list({
        limit: 10,
        dateFrom: '2026-08-01',
        dateTo: '2026-07-01',
      })
    ).rejects.toBeInstanceOf(ModelValidationError);
    await expect(
      repository.list({
        limit: 10,
        tagIds: {
          ids: [],
          match: 'neither',
        },
      } as unknown as EventListQuery)
    ).rejects.toBeInstanceOf(ModelValidationError);
    await expect(
      repository.list({
        limit: 10,
        timeFrom: '24:00',
      } as EventListQuery)
    ).rejects.toBeInstanceOf(ModelValidationError);
    await expect(
      repository.list({
        limit: 10,
        timeTo: '12:60',
      } as EventListQuery)
    ).rejects.toBeInstanceOf(ModelValidationError);
    await expect(
      repository.list({ limit: 10, cursor: 'not-a-cursor' })
    ).rejects.toBeInstanceOf(ModelValidationError);
  });
});
