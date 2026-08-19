import type { Database } from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppDatabase } from './database';
import { categories, locations, people, tags } from './schema';
import { createTestDatabase } from './testing/createTestDatabase';

const SEED_TIMESTAMP = '2026-08-19T00:00:00.000Z';

describe('default seed data migration', () => {
  let sqlite: Database;
  let database: AppDatabase;

  beforeEach(async () => {
    ({ sqlite, database } = await createTestDatabase({
      includeSeedData: true,
    }));
  });

  afterEach(() => sqlite.close());

  it('inserts the product defaults with stable IDs and timestamps', () => {
    expect(database.select().from(categories).all()).toEqual([
      {
        id: '148d67ea-a892-412c-8293-4f469621ba43',
        name: 'Personal',
        color: 'magenta',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
        deletedAt: null,
      },
      {
        id: '237ef166-7b37-43f7-b7d5-6bb453d88259',
        name: 'Work',
        color: 'blue',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
        deletedAt: null,
      },
      {
        id: '5c92cef4-26c0-49cf-837f-ff90cb46a0a5',
        name: 'Travel',
        color: 'green',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
        deletedAt: null,
      },
    ]);
    expect(database.select().from(tags).all()).toEqual([
      expect.objectContaining({
        id: '24a52b26-c31f-432d-b7d2-05b1afe55441',
        name: 'Health',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      }),
      expect.objectContaining({
        id: '855fbb4f-3131-48d4-afe1-ed611e366786',
        name: 'Studies',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      }),
      expect.objectContaining({
        id: 'ed8f910d-c4cd-45d7-9c09-dfa67d14788f',
        name: 'Family',
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP,
      }),
    ]);
    expect(database.select().from(locations).all()).toEqual([]);
    expect(database.select().from(people).all()).toEqual([]);
  });
});
