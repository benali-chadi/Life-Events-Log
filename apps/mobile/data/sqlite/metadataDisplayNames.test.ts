import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from './testing/createTestDatabase';
import { createSQLiteRepositories } from './createSQLiteRepositories';
import {
  categories,
  tags,
  people,
  locations,
  syncPendingOperations,
} from './schema';
import { applyOperation } from './sync/applyOperation';
import { createOperation } from './sync/createOperation';
import { metadataWithDisplayName } from '../repositories/metadataName';

const at = '2026-09-22T12:00:00.000Z';
let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  fixture = await createTestDatabase({ initializeSyncState: true });
});
afterEach(() => fixture.sqlite.close());
const cases = [
  ['category', categories, 'categories'],
  ['tag', tags, 'tags'],
  ['person', people, 'people'],
  ['location', locations, 'locations'],
] as const;

describe.each(cases)('%s display names', (entityType, table, repositoryKey) => {
  it('accepts synced duplicates, uses all active peers, and keeps local uniqueness', async () => {
    const { database } = fixture;
    const repos = createSQLiteRepositories(database, {
      createId: () => 'new-local',
      now: () => at,
    });
    const repository = repos[repositoryKey];
    for (const id of ['aaaaaaaa-one', 'bbbbbbbb-two']) {
      database.transaction((tx) => {
        const input =
          entityType === 'category'
            ? {
                operationType: 'entity.create' as const,
                entityType,
                entityId: id,
                payload: {
                  name: 'Travel',
                  color: 'blue' as const,
                  createdAt: at,
                  updatedAt: at,
                },
              }
            : {
                operationType: 'entity.create' as const,
                entityType,
                entityId: id,
                payload: { name: 'Travel', createdAt: at, updatedAt: at },
              };
        applyOperation(createOperation(input, tx), tx);
      });
    }
    expect((await repository.getById('aaaaaaaa-one'))?.displayName).toBe(
      'Travel · aaaaaaaa'
    );
    expect(
      (await repository.listWithUsage()).map((row) => row.metadata.displayName)
    ).toEqual(['Travel · aaaaaaaa', 'Travel · bbbbbbbb']);
    expect(
      (await repository.list({ search: 'bbbbbbbb' })).map((row) => row.id)
    ).toEqual(['bbbbbbbb-two']);
    await expect(
      repository.create({ name: ' TRAVEL ', color: 'blue' })
    ).rejects.toThrow();
    await expect(
      repository.update('aaaaaaaa-one', { name: 'Travel' })
    ).resolves.toMatchObject({ name: 'Travel' });
    if (entityType === 'category')
      await expect(
        repos.categories.update('aaaaaaaa-one', { color: 'green' })
      ).resolves.toMatchObject({ color: 'green' });
    await repository.update('aaaaaaaa-one', { name: 'Holidays' });
    expect((await repository.getById('bbbbbbbb-two'))?.displayName).toBe(
      'Travel'
    );
    await expect(
      repository.update('aaaaaaaa-one', { name: 'travel' })
    ).rejects.toThrow();
    for (const operation of database
      .select()
      .from(syncPendingOperations)
      .all()) {
      expect(JSON.stringify(operation.payload)).not.toContain('displayName');
    }
    expect(
      database.select().from(table).where(eq(table.id, 'bbbbbbbb-two')).get()
    ).toMatchObject({ name: 'Travel', normalizedName: 'travel' });
  });

  it('expands colliding ID prefixes and ignores tombstones', async () => {
    const { database } = fixture;
    const rows = ['aaaaaaaa-one', 'aaaaaaaa-two', 'cccccccc-three'].map(
      (id) => ({
        id,
        name: 'Travel',
        normalizedName: 'travel',
        color: 'blue' as const,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      })
    );
    database.insert(table).values(rows).run();
    const repository = createSQLiteRepositories(database, {
      createId: () => 'unused',
      now: () => at,
    })[repositoryKey];
    const results = await repository.list();
    expect(results.map((row) => row.displayName)).toEqual([
      'Travel · aaaaaaaa-one',
      'Travel · aaaaaaaa-two',
      'Travel · cccccccc',
    ]);
    expect(results.map((row) => row.displayName)).toEqual(
      rows.map((row) => metadataWithDisplayName(row, rows).displayName)
    );
    database
      .update(table)
      .set({ deletedAt: at })
      .where(eq(table.id, 'aaaaaaaa-two'))
      .run();
    database
      .update(table)
      .set({ deletedAt: at })
      .where(eq(table.id, 'cccccccc-three'))
      .run();
    expect((await repository.getById('aaaaaaaa-one'))?.displayName).toBe(
      'Travel'
    );
  });
});

it('keeps non-unique active-name indexes after migration', () => {
  for (const [, , name] of cases) {
    const indexes = fixture.sqlite.exec(`PRAGMA index_list('${name}')`)[0]!;
    const row = indexes.values.find(
      (row) => row[1] === `${name}_active_normalized_name_idx`
    );
    expect(row?.[2]).toBe(0);
    expect(row?.[4]).toBe(1);
  }
});

it('uses the same labels in timeline JSON and event-detail joins', async () => {
  const { database } = fixture;
  for (const [, table] of cases) {
    database
      .insert(table)
      .values(
        ['aaaaaaaa-one', 'bbbbbbbb-two'].map((id) => ({
          id,
          name: 'Travel',
          normalizedName: 'travel',
          color: 'blue' as const,
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        }))
      )
      .run();
  }
  const repos = createSQLiteRepositories(database, {
    createId: () => 'event-one',
    now: () => at,
  });
  await repos.events.create({
    title: 'Trip',
    date: '2026-09-22',
    time: null,
    significance: 'ordinary',
    notes: '',
    categoryId: 'aaaaaaaa-one',
    locationId: 'aaaaaaaa-one',
    tagIds: ['aaaaaaaa-one'],
    peopleIds: ['aaaaaaaa-one'],
  });
  const detail = (await repos.events.getDetailsById('event-one'))!;
  const item = (await repos.events.list({ limit: 10 })).items[0]!;
  for (const row of [detail, item]) {
    expect(row.category?.displayName).toBe('Travel · aaaaaaaa');
    expect(row.location?.displayName).toBe('Travel · aaaaaaaa');
    expect(row.tags[0]?.displayName).toBe('Travel · aaaaaaaa');
    expect(row.people[0]?.displayName).toBe('Travel · aaaaaaaa');
  }
});
