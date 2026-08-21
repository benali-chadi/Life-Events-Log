import type { Database } from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from './database';
import { runDataMigrations } from './dataMigrations';
import { categories, events } from './schema';
import { createTestDatabase } from './testing/createTestDatabase';

const NOW = '2026-08-21T10:00:00.000Z';

describe('normalized search value data migration', () => {
  let sqlite: Database;
  let database: AppDatabase;

  beforeEach(async () => {
    ({ sqlite, database } = await createTestDatabase({
      runDataMigrations: false,
    }));
  });

  afterEach(() => sqlite.close());

  it('backfills Unicode-aware normalized metadata names and event titles once', () => {
    database
      .insert(categories)
      .values({
        id: 'category',
        name: 'École   Centrale',
        normalizedName: 'École   centrale',
        color: 'blue',
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      })
      .run();
    database
      .insert(events)
      .values({
        id: 'event',
        title: 'ÉTÉ   à Rabat',
        normalizedTitle: 'ÉTÉ   à rabat',
        date: '2026-08-21',
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

    runDataMigrations(database);
    runDataMigrations(database);

    expect(
      database
        .select({ value: categories.normalizedName })
        .from(categories)
        .get()?.value
    ).toBe('école centrale');
    expect(
      database.select({ value: events.normalizedTitle }).from(events).get()
        ?.value
    ).toBe('été à rabat');
  });
});
