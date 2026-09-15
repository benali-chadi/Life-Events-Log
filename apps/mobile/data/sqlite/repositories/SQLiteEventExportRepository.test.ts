import type { Database } from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RepositoryDependencies } from '@/data/repositories';
import type { UUID } from '@/models';
import type { AppDatabase } from '../database';
import { categories, people, tags } from '../schema';
import { createTestDatabase } from '../testing/createTestDatabase';
import { SQLiteEventRepository } from './SQLiteEventRepository';
import { SQLiteEventExportRepository } from './SQLiteEventExportRepository';

const NOW = '2026-09-03T12:00:00.000Z';
const FIRST_ID = '90000000-0000-4000-8000-000000000001';
const SECOND_ID = '90000000-0000-4000-8000-000000000002';
const CATEGORY_ID = '10000000-0000-4000-8000-000000000001';
const TAG_ID = '30000000-0000-4000-8000-000000000001';
const PERSON_ID = '40000000-0000-4000-8000-000000000001';

describe('SQLiteEventExportRepository', () => {
  let sqlite: Database;
  let database: AppDatabase;
  let repository: SQLiteEventExportRepository;

  beforeEach(async () => {
    ({ sqlite, database } = await createTestDatabase({
      initializeSyncState: true,
    }));
    const generatedIds: UUID[] = [FIRST_ID, SECOND_ID];
    const dependencies: RepositoryDependencies = {
      createId: () => generatedIds.shift()!,
      now: () => NOW,
    };
    const events = new SQLiteEventRepository(database, dependencies);
    repository = new SQLiteEventExportRepository(database, events);

    database
      .insert(categories)
      .values({
        id: CATEGORY_ID,
        name: 'Travel',
        normalizedName: 'travel',
        color: 'blue',
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      })
      .run();
    database
      .insert(tags)
      .values({
        id: TAG_ID,
        name: 'Family',
        normalizedName: 'family',
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      })
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

    await events.create({
      title: 'Family trip',
      date: '2026-09-01',
      time: '09:00',
      significance: 'notable',
      categoryId: CATEGORY_ID,
      locationId: null,
      notes: 'Complete notes that exceed a timeline preview.',
      tagIds: [TAG_ID],
      peopleIds: [PERSON_ID],
    });
    await events.create({
      title: 'Dentist',
      date: '2026-08-01',
      time: null,
      significance: 'ordinary',
      categoryId: null,
      locationId: null,
      notes: 'Routine visit',
      tagIds: [],
      peopleIds: [],
    });
  });

  afterEach(() => sqlite.close());

  it('loads selected events in requested order and removes duplicate ids', async () => {
    const result = await repository.getByIds([
      SECOND_ID,
      FIRST_ID,
      SECOND_ID,
      'missing-event',
    ]);

    expect(result.map(({ event }) => event.id)).toEqual([SECOND_ID, FIRST_ID]);
    expect(result[1]).toMatchObject({
      event: { notes: 'Complete notes that exceed a timeline preview.' },
      category: { id: CATEGORY_ID },
      tags: [{ id: TAG_ID }],
      people: [{ id: PERSON_ID }],
    });
  });

  it('loads complete export records using the timeline filters and ordering', async () => {
    const result = await repository.list({ search: 'family' });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      event: {
        id: FIRST_ID,
        title: 'Family trip',
        notes: 'Complete notes that exceed a timeline preview.',
      },
      category: { name: 'Travel' },
      tags: [{ name: 'Family' }],
      people: [{ name: 'Leila' }],
    });
  });
});
