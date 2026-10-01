import { expect, it } from 'vitest';
import type {
  CommitEventImportInput,
  RepositoryDependencies,
} from '@/data/repositories';
import { eventImportRepositoryContract } from '@/data/repositories/eventImportRepositoryContract';
import { createSQLiteRepositories } from '../createSQLiteRepositories';
import { createTestDatabase } from '../testing/createTestDatabase';
import {
  events,
  tags,
  people,
  locations,
  categories,
  eventTags,
  eventPeople,
  syncPendingOperations,
  syncOperations,
  syncFieldVersions,
  syncFrontiers,
  syncLocalState,
} from '../schema';

function importInput(): CommitEventImportInput {
  return {
    category: { kind: 'new', name: 'Imported', color: 'blue' },
    newMetadata: {
      tags: [{ temporaryId: 'tag', name: 'Travel' }],
      people: [{ temporaryId: 'person', name: 'Person' }],
      locations: [{ temporaryId: 'location', name: 'Place' }],
    },
    events: [
      {
        title: 'Imported event',
        date: '2026-09-01',
        time: null,
        significance: 'ordinary',
        notes: '',
        category: null,
        tags: [
          { kind: 'new', temporaryId: 'tag' },
          { kind: 'new', temporaryId: 'tag' },
        ],
        people: [{ kind: 'new', temporaryId: 'person' }],
        location: { kind: 'new', temporaryId: 'location' },
      },
    ],
  };
}

it('records all import writes as pending intent without sealing or duplicating reused metadata', async () => {
  const { sqlite, database } = await createTestDatabase({
    initializeSyncState: true,
  });
  try {
    const repositories = createSQLiteRepositories(database, dependencies());
    const state = database.select().from(syncLocalState).all();
    const input = importInput();
    await repositories.eventImports.commit(input);
    const first = database.select().from(syncPendingOperations).all();
    expect(
      first
        .filter((op) => op.operationType === 'entity.create')
        .map((op) => op.entityType)
        .sort()
    ).toEqual(['category', 'event', 'location', 'person', 'tag']);
    expect(
      first.filter((op) => op.operationType === 'relation.add')
    ).toHaveLength(2);
    for (const row of first.filter(
      (op) => op.operationType === 'relation.add'
    )) {
      expect(row.entityId).toBe(
        JSON.stringify(
          row.entityType === 'event_tag'
            ? [
                database.select().from(events).get()!.id,
                database.select().from(tags).get()!.id,
              ]
            : [
                database.select().from(events).get()!.id,
                database.select().from(people).get()!.id,
              ]
        )
      );
    }
    const result = await repositories.eventImports.commit(input);
    expect(result.createdMetadata).toEqual({
      categoryCount: 0,
      tagCount: 0,
      peopleCount: 0,
      locationCount: 0,
    });
    const all = database.select().from(syncPendingOperations).all();
    expect(all).toHaveLength(10); // Four shared metadata, two events and four relations.
    for (const row of first) expect(all).toContainEqual(row);
    for (const table of [syncOperations, syncFieldVersions, syncFrontiers]) {
      expect(database.select().from(table).all()).toEqual([]);
    }
    expect(database.select().from(syncLocalState).all()).toEqual(state);
  } finally {
    sqlite.close();
  }
});

it('rolls back domain and pending writes if a later imported event fails', async () => {
  const { sqlite, database } = await createTestDatabase({
    initializeSyncState: true,
  });
  try {
    let nextId = 0;
    const repositories = createSQLiteRepositories(database, {
      now: () => '2026-09-01T12:00:00.000Z',
      createId: () => `id-${Math.min(++nextId, 5)}`, // Four metadata, then repeated event ID.
    });
    const input = importInput();
    await expect(
      repositories.eventImports.commit({
        ...input,
        events: [
          ...input.events,
          { ...input.events[0]!, title: 'Second event' },
        ],
      })
    ).rejects.toThrow('duplicate event ID');
    for (const table of [
      events,
      tags,
      people,
      locations,
      categories,
      eventTags,
      eventPeople,
      syncPendingOperations,
      syncOperations,
    ]) {
      expect(database.select().from(table).all()).toEqual([]);
    }
  } finally {
    sqlite.close();
  }
});

function dependencies(): RepositoryDependencies {
  let nextId = 0;
  return {
    createId: () => `generated-${++nextId}`,
    now: () => '2026-09-01T12:00:00.000Z',
  };
}

eventImportRepositoryContract('SQLite', async () => {
  const { database } = await createTestDatabase({ initializeSyncState: true });
  return createSQLiteRepositories(database, dependencies());
});
