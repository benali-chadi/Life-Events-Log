import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import type { AppDatabase } from '../database';
import {
  categories,
  locations,
  events,
  eventTags,
  eventPeople,
  syncOperations,
} from '../schema';
import { createTestDatabase } from '../testing/createTestDatabase';
import { applyDomainMutation } from './applyDomainMutation';
import type { Operation } from './types';
import { normalizeSearchText } from '@/data/repositories/metadataName';

let sqlite: Database;
let database: AppDatabase;
const at = '2026-09-15T00:00:00.000Z';
const operation: Extract<
  Operation,
  { operationType: 'entity.create'; entityType: 'event' }
> = {
  operationType: 'entity.create',
  entityType: 'event',
  entityId: 'event',
  originDeviceId: 'device',
  originSequence: 1,
  lamport: 1,
  causalContext: {},
  operationHash: 'not-used-by-domain-writer',
  payload: {
    title: 'Été',
    date: '2026-09-15',
    time: null,
    significance: 'ordinary',
    categoryId: null,
    locationId: null,
    notes: ' **Notes** ',
    createdAt: at,
    updatedAt: at,
  },
};
beforeEach(async () => {
  ({ sqlite, database } = await createTestDatabase());
});
afterEach(() => sqlite.close());

it('inserts the complete event, derives its search title, and leaves relations and sync alone', () => {
  const snapshot = JSON.stringify(operation);
  database.transaction((tx) =>
    applyDomainMutation(
      operation,
      [
        'title',
        'date',
        'time',
        'significance',
        'category_id',
        'location_id',
        'notes',
        'deleted_at',
      ],
      tx
    )
  );
  expect(database.select().from(events).get()).toEqual({
    ...operation.payload,
    id: 'event',
    deletedAt: null,
    normalizedTitle: normalizeSearchText('Été'),
  });
  expect(JSON.stringify(operation)).toBe(snapshot);
  expect(database.select().from(eventTags).all()).toEqual([]);
  expect(database.select().from(eventPeople).all()).toEqual([]);
  expect(database.select().from(syncOperations).all()).toEqual([]);
});

it('retains references to tombstoned metadata', () => {
  const metadata = {
    name: 'Deleted',
    createdAt: at,
    updatedAt: at,
    deletedAt: at,
  };
  database
    .insert(categories)
    .values({ ...metadata, id: 'category', color: 'blue' })
    .run();
  database
    .insert(locations)
    .values({ ...metadata, id: 'location' })
    .run();
  database.transaction((tx) =>
    applyDomainMutation(
      {
        ...operation,
        payload: {
          ...operation.payload,
          categoryId: 'category',
          locationId: 'location',
        },
      },
      [],
      tx
    )
  );
  expect(database.select().from(events).get()).toMatchObject({
    categoryId: 'category',
    locationId: 'location',
  });
});

it('does not upsert an existing event and rolls back the caller transaction', () => {
  expect(() =>
    database.transaction((tx) => {
      applyDomainMutation(operation, [], tx);
      applyDomainMutation(operation, [], tx);
    })
  ).toThrow();
  expect(database.select().from(events).all()).toEqual([]);
});

it('rejects unimplemented operation/entity combinations explicitly', () => {
  expect(() =>
    database.transaction((tx) =>
      applyDomainMutation(
        {
          ...operation,
          operationType: 'event.attachment.reorder',
          payload: { orderedAttachmentIds: [], updatedAt: at },
        },
        [],
        tx
      )
    )
  ).toThrow('not implemented');
  expect(() =>
    database.transaction((tx) =>
      applyDomainMutation(
        {
          ...operation,
          operationType: 'attachment.delete',
          entityType: 'attachment',
          payload: { deletedAt: at },
        },
        [],
        tx
      )
    )
  ).toThrow('not implemented');
});
