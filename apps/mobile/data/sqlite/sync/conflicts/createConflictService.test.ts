import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { QueryClient } from '@tanstack/react-query';
import { createTestDatabase } from '../../testing/createTestDatabase';
import {
  events,
  tags,
  categories,
  syncOperations,
  syncConflicts,
  syncPendingOperations,
  syncFieldVersions,
  syncLocalState,
  syncFrontiers,
} from '../../schema';
import { applyOperation } from '../applyOperation';
import { applyPendingOperation } from '../pending/applyPendingOperation';
import { hashOperationContent } from '../utils/hashOperationContent';
import type { CreateOperationInput, Operation } from '../types';
import { createConflictService } from './createConflictService';
import { invalidateConflictResolution } from '../../../query/invalidation';
import {
  conflictKeys,
  eventKeys,
  categoryKeys,
  tagKeys,
  personKeys,
  locationKeys,
  attachmentKeys,
} from '../../../query/queryKeys';

const at = '2026-09-30T10:00:00.000Z';
const now = '2026-09-30T11:00:00.000Z';
let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  fixture = await createTestDatabase({ initializeSyncState: true });
});
afterEach(() => fixture.sqlite.close());
function service() {
  return createConflictService(fixture.database, { now: () => now });
}
function apply(
  input: CreateOperationInput,
  originDeviceId: string,
  causalContext: Record<string, number> = {}
) {
  const content = {
    ...input,
    originDeviceId,
    originSequence: 1,
    lamport: Object.keys(causalContext).length ? 2 : 1,
    causalContext,
  };
  const operation = {
    ...content,
    operationHash: hashOperationContent(content),
  } as Operation;
  fixture.database.transaction((tx) => applyOperation(operation, tx));
}
function eventConflict() {
  apply(
    {
      operationType: 'entity.create',
      entityType: 'event',
      entityId: 'event',
      payload: {
        title: 'Original',
        date: '2026-09-30',
        time: null,
        notes: '',
        significance: 'ordinary',
        categoryId: null,
        locationId: null,
        createdAt: at,
        updatedAt: at,
      },
    },
    'seed'
  );
  for (const origin of ['a', 'b'])
    apply(
      {
        operationType: 'entity.patch',
        entityType: 'event',
        entityId: 'event',
        payload: {
          changes: {
            title: origin,
            notes: origin,
            time: origin === 'a' ? null : '10:00',
          },
          updatedAt: at,
        },
      },
      origin,
      { seed: 1 }
    );
  return service()
    .getConflicts('event', 'event')
    .find((row) => row.fieldName === 'title')!;
}
function sealedState() {
  const db = fixture.database;
  return [
    db.select().from(syncOperations).all(),
    db.select().from(syncFieldVersions).all(),
    db.select().from(syncLocalState).all(),
    db.select().from(syncFrontiers).all(),
  ];
}

it.each(['current', 'alternative'] as const)(
  'resolves %s with only a single-field pending patch, even for an unchanged value',
  (choice) => {
    const conflict = eventConflict();
    expect(conflict).toMatchObject({
      currentValue: 'b',
      alternativeValue: 'a',
    });
    const before = sealedState();
    expect(service().resolveConflict(conflict.conflictId, choice)).toEqual({
      status: 'resolved',
      entityType: 'event',
      entityId: 'event',
    });
    const selected = choice === 'current' ? 'b' : 'a';
    expect(fixture.database.select().from(events).get()).toMatchObject({
      title: selected,
      notes: 'b',
      updatedAt: now,
    });
    expect(
      fixture.database.select().from(syncPendingOperations).get()
    ).toMatchObject({
      operationType: 'entity.patch',
      payload: { changes: { title: selected }, updatedAt: now },
    });
    expect(
      service()
        .getConflicts('event', 'event')
        .map((row) => row.fieldName)
        .sort()
    ).toEqual(['notes', 'time']);
    expect(sealedState()).toEqual(before);
    expect(service().resolveConflict(conflict.conflictId, choice)).toEqual({
      status: 'already-resolved',
    });
  }
);

it('preserves null alternatives and compacts into an existing pending patch', () => {
  eventConflict();
  fixture.database.transaction((tx) =>
    applyPendingOperation(
      {
        operationType: 'entity.patch',
        entityType: 'event',
        entityId: 'event',
        payload: { changes: { date: '2026-10-01' }, updatedAt: at },
      },
      tx
    )
  );
  const conflict = service()
    .getConflicts('event', 'event')
    .find((row) => row.fieldName === 'time')!;
  expect(conflict.alternativeValue).toBeNull();
  service().resolveConflict(conflict.conflictId, 'alternative');
  expect(
    fixture.database.select().from(syncPendingOperations).all()
  ).toHaveLength(1);
  expect(
    fixture.database.select().from(syncPendingOperations).get()?.payload
  ).toEqual({ changes: { date: '2026-10-01', time: null }, updatedAt: now });
});

it('returns only the requested entity pending conflicts and handles missing IDs', () => {
  const conflict = eventConflict();
  expect(service().getConflicts('event', 'other')).toEqual([]);
  expect(service().getConflicts('tag', 'event')).toEqual([]);
  fixture.database
    .update(syncConflicts)
    .set({ status: 'resolved' })
    .where(eq(syncConflicts.conflictId, conflict.conflictId))
    .run();
  expect(service().getConflicts('event', 'event')).toHaveLength(2);
  expect(service().resolveConflict(conflict.conflictId, 'current')).toEqual({
    status: 'already-resolved',
  });
  expect(service().resolveConflict('missing', 'current')).toEqual({
    status: 'already-resolved',
  });
});

it('rejects inactive targets and missing history without consuming the conflict', () => {
  const conflict = eventConflict();
  fixture.database.update(events).set({ deletedAt: now }).run();
  expect(() =>
    service().resolveConflict(conflict.conflictId, 'alternative')
  ).toThrow('not found');
  fixture.database.update(events).set({ deletedAt: null }).run();
  fixture.database
    .update(syncConflicts)
    .set({ losingDeviceId: 'missing' })
    .where(eq(syncConflicts.conflictId, conflict.conflictId))
    .run();
  expect(() =>
    service().resolveConflict(conflict.conflictId, 'current')
  ).toThrow('history');
  expect(fixture.database.select().from(syncPendingOperations).all()).toEqual(
    []
  );
  expect(fixture.database.select().from(syncConflicts).all()).toHaveLength(3);
});

it('rolls back the domain change when pending persistence fails', () => {
  const conflict = eventConflict();
  fixture.sqlite.run(
    "CREATE TRIGGER fail_pending BEFORE INSERT ON sync_pending_operations BEGIN SELECT RAISE(ABORT, 'pending failed'); END;"
  );
  expect(() =>
    service().resolveConflict(conflict.conflictId, 'alternative')
  ).toThrow('pending failed');
  expect(fixture.database.select().from(events).get()?.title).toBe('b');
  expect(service().getConflicts('event', 'event')).toHaveLength(3);
});

it('resolves metadata names while respecting local name uniqueness', () => {
  apply(
    {
      operationType: 'entity.create',
      entityType: 'tag',
      entityId: 'tag',
      payload: { name: 'Original', createdAt: at, updatedAt: at },
    },
    'seed'
  );
  for (const origin of ['a', 'b'])
    apply(
      {
        operationType: 'entity.patch',
        entityType: 'tag',
        entityId: 'tag',
        payload: { changes: { name: origin }, updatedAt: at },
      },
      origin,
      { seed: 1 }
    );
  const conflict = service().getConflicts('tag', 'tag')[0]!;
  fixture.database
    .insert(tags)
    .values({
      id: 'other',
      name: 'A',
      normalizedName: 'a',
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    })
    .run();
  expect(() =>
    service().resolveConflict(conflict.conflictId, 'alternative')
  ).toThrow('already exists');
  expect(service().getConflicts('tag', 'tag')).toHaveLength(1);
  fixture.database
    .update(tags)
    .set({ deletedAt: now })
    .where(eq(tags.id, 'other'))
    .run();
  service().resolveConflict(conflict.conflictId, 'alternative');
  expect(
    fixture.database.select().from(tags).where(eq(tags.id, 'tag')).get()
  ).toMatchObject({ name: 'a', normalizedName: 'a' });
});

it('resolves category color without overwriting its name', () => {
  apply(
    {
      operationType: 'entity.create',
      entityType: 'category',
      entityId: 'category',
      payload: {
        name: 'Category',
        color: 'blue',
        createdAt: at,
        updatedAt: at,
      },
    },
    'seed'
  );
  for (const [origin, color] of [
    ['a', 'rose'],
    ['b', 'green'],
  ] as const)
    apply(
      {
        operationType: 'entity.patch',
        entityType: 'category',
        entityId: 'category',
        payload: { changes: { color }, updatedAt: at },
      },
      origin,
      { seed: 1 }
    );
  service().resolveConflict(
    service().getConflicts('category', 'category')[0]!.conflictId,
    'alternative'
  );
  expect(fixture.database.select().from(categories).get()).toMatchObject({
    name: 'Category',
    color: 'rose',
  });
});

it('invalidates conflicts and entity views without invalidating unrelated attachment queries', async () => {
  const client = new QueryClient();
  const affected = [
    conflictKeys.entity('event', 'event'),
    eventKeys.detail('event'),
    eventKeys.record('event'),
    eventKeys.lists(),
    categoryKeys.lists(),
    tagKeys.detail('tag'),
    personKeys.usageLists(),
    locationKeys.lists(),
  ];
  for (const key of [...affected, attachmentKeys.all])
    client.setQueryData(key, {});
  await invalidateConflictResolution(client);
  for (const key of affected)
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  expect(client.getQueryState(attachmentKeys.all)?.isInvalidated).toBe(false);
  client.clear();
});

it.each(['category', 'tag', 'person', 'location'] as const)(
  'lists all pending %s conflicts without mixing other types',
  (entityType) => {
    eventConflict();
    for (const id of ['first', 'second']) {
      const seed = `${entityType}-${id}-seed`;
      const payload = { name: id, createdAt: at, updatedAt: at };
      apply(
        entityType === 'category'
          ? {
              operationType: 'entity.create',
              entityType,
              entityId: id,
              payload: { ...payload, color: 'blue' },
            }
          : {
              operationType: 'entity.create',
              entityType,
              entityId: id,
              payload,
            },
        seed
      );
      for (const origin of ['a', 'b'])
        apply(
          {
            operationType: 'entity.patch',
            entityType,
            entityId: id,
            payload: { changes: { name: `${id}-${origin}` }, updatedAt: at },
          },
          `${seed}-${origin}`,
          { [seed]: 1 }
        );
    }
    expect(
      service()
        .getConflicts(entityType)
        .map((row) => row.entityId)
        .sort()
    ).toEqual(['first', 'second']);
    expect(service().getConflicts(entityType, 'first')).toHaveLength(1);
    const first = service().getConflicts(entityType, 'first')[0]!;
    service().resolveConflict(first.conflictId, 'alternative');
    expect(
      service()
        .getConflicts(entityType)
        .map((row) => row.entityId)
    ).toEqual(['second']);
    expect(service().getConflicts('event', 'event')).toHaveLength(3);
  }
);
