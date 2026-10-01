import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from '../../testing/createTestDatabase';
import { applyOperation } from '../applyOperation';
import { createOperation } from '../createOperation';
import { hashOperationContent } from '../utils/hashOperationContent';
import {
  eventTags,
  eventPeople,
  events,
  syncOperations,
  syncConflicts,
  syncFieldVersions,
  tags,
} from '../../schema';
import type { CreateOperationInput, Operation, CausalContext } from '../types';

const at = '2026-09-16T00:00:00.000Z';
const later = '2026-09-17T00:00:00.000Z';
const future = '2030-01-01T00:00:00.000Z';
function signed(
  input: CreateOperationInput,
  originDeviceId: string,
  lamport: number,
  causalContext: CausalContext,
  originSequence = 1
): Operation {
  const content = {
    ...input,
    originDeviceId,
    lamport,
    causalContext,
    originSequence,
  };
  return { ...content, operationHash: hashOperationContent(content) };
}
async function setup(entityType: 'event_tag' | 'event_person') {
  const result = await createTestDatabase({ initializeSyncState: true });
  const { database } = result;
  const apply = (operation: Operation) =>
    database.transaction((tx) =>
      applyOperation(operation, tx, { now: () => at })
    );
  const local = (input: CreateOperationInput) =>
    database.transaction((tx) =>
      applyOperation(createOperation(input, tx), tx, { now: () => at })
    );
  local({
    operationType: 'entity.create',
    entityType: 'event',
    entityId: 'event',
    payload: {
      title: 'Event',
      date: '2026-09-16',
      time: null,
      significance: 'ordinary',
      categoryId: null,
      locationId: null,
      notes: '',
      createdAt: at,
      updatedAt: at,
    },
  });
  local({
    operationType: 'entity.create',
    entityType: entityType === 'event_tag' ? 'tag' : 'person',
    entityId: 'metadata',
    payload: { name: 'Metadata', createdAt: at, updatedAt: at },
  });
  function input(
    add: boolean,
    timestamp = at,
    createdAt = at
  ): CreateOperationInput {
    const endpoints =
      entityType === 'event_tag'
        ? { eventId: 'event', tagId: 'metadata' }
        : { eventId: 'event', personId: 'metadata' };
    return {
      operationType: add ? 'relation.add' : 'relation.remove',
      entityType,
      entityId: JSON.stringify(['event', 'metadata']),
      payload: add
        ? { ...endpoints, createdAt, updatedAt: timestamp }
        : { ...endpoints, deletedAt: timestamp },
    } as CreateOperationInput;
  }
  return {
    ...result,
    apply,
    local,
    input,
    table: entityType === 'event_tag' ? eventTags : eventPeople,
  };
}

it.each(['event_tag', 'event_person'] as const)(
  'reactivates %s and preserves its original creation timestamp',
  async (entityType) => {
    const s = await setup(entityType);
    try {
      s.local(s.input(true));
      s.local(s.input(false, later));
      expect(s.database.select().from(s.table).get()?.deletedAt).toBe(later);
      s.local(s.input(true, future));
      expect(s.database.select().from(s.table).get()).toMatchObject({
        deletedAt: null,
        createdAt: at,
        updatedAt: future,
      });
      expect(s.database.select().from(syncConflicts).all()).toEqual([]);
      expect(s.database.select().from(events).get()?.updatedAt).toBe(at);
    } finally {
      s.sqlite.close();
    }
  }
);

it.each(['event_tag', 'event_person'] as const)(
  'converges concurrent add/remove for %s in both orders',
  async (entityType) => {
    const states: unknown[] = [];
    for (const reversed of [false, true]) {
      const s = await setup(entityType);
      try {
        s.apply(signed(s.input(true), 'initial', 3, { 'test-device': 2 }));
        const context = { 'test-device': 2, initial: 1 };
        const add = signed(s.input(true, future), 'a', 4, context);
        const remove = signed(s.input(false, later), 'z', 4, context);
        for (const operation of reversed ? [remove, add] : [add, remove])
          s.apply(operation);
        const row = s.database.select().from(s.table).get();
        expect(row).toMatchObject({
          deletedAt: later,
          updatedAt: later,
          createdAt: at,
        });
        states.push({
          row,
          versions: s.database.select().from(syncFieldVersions).all(),
          event: s.database.select().from(events).get(),
        });
        expect(s.database.select().from(syncConflicts).all()).toEqual([]);
        expect(s.database.select().from(syncOperations).all()).toHaveLength(5);
      } finally {
        s.sqlite.close();
      }
    }
    expect(states[0]).toEqual(states[1]);
  }
);

it('converges concurrent first additions with different creation times', async () => {
  const rows: unknown[] = [];
  for (const reversed of [false, true]) {
    const s = await setup('event_tag');
    try {
      const a = signed(s.input(true, at, at), 'a', 3, { 'test-device': 2 });
      const b = signed(s.input(true, later, later), 'b', 3, {
        'test-device': 2,
      });
      for (const operation of reversed ? [b, a] : [a, b]) s.apply(operation);
      rows.push(s.database.select().from(s.table).get());
    } finally {
      s.sqlite.close();
    }
  }
  expect(rows[0]).toEqual(rows[1]);
  expect(rows[0]).toMatchObject({
    createdAt: later,
    updatedAt: later,
    deletedAt: null,
  });
});

it('a concurrent addition can win over removal by LWW', async () => {
  for (const reversed of [false, true]) {
    const s = await setup('event_tag');
    try {
      s.apply(signed(s.input(true), 'initial', 3, { 'test-device': 2 }));
      const context = { 'test-device': 2, initial: 1 };
      const operations = [
        signed(s.input(false, future), 'a', 4, context),
        signed(s.input(true, later), 'z', 4, context),
      ];
      for (const operation of reversed ? operations.reverse() : operations)
        s.apply(operation);
      expect(s.database.select().from(s.table).get()).toMatchObject({
        deletedAt: null,
        updatedAt: later,
      });
      expect(
        s.database
          .select()
          .from(syncFieldVersions)
          .all()
          .find((row) => row.entityType === 'event_tag')
      ).toMatchObject({ winnerDeviceId: 'z' });
    } finally {
      s.sqlite.close();
    }
  }
});

it('retains relation state when endpoints are tombstoned', async () => {
  const s = await setup('event_tag');
  try {
    s.local({
      operationType: 'entity.delete',
      entityType: 'tag',
      entityId: 'metadata',
      payload: { deletedAt: at },
    });
    s.local({
      operationType: 'entity.delete',
      entityType: 'event',
      entityId: 'event',
      payload: { deletedAt: at },
    });
    s.apply(signed(s.input(true), 'remote', 3, { 'test-device': 2 }));
    expect(s.database.select().from(s.table).get()?.deletedAt).toBeNull();
    expect(s.database.select().from(events).get()?.deletedAt).toBe(at);
    expect(s.database.select().from(tags).get()?.deletedAt).toBe(at);
  } finally {
    s.sqlite.close();
  }
});

it('rejects missing endpoints, missing relationships, and noncausal removals', async () => {
  const s = await setup('event_tag');
  try {
    expect(() =>
      s.apply(signed(s.input(false), 'remove', 3, { 'test-device': 2 }))
    ).toThrow('not found');
    expect(() => s.apply(signed(s.input(true), 'bad', 3, {}))).toThrow(
      'endpoint creation'
    );
    s.apply(signed(s.input(true), 'add', 3, { 'test-device': 2 }));
    expect(() =>
      s.apply(signed(s.input(false), 'remove', 4, { 'test-device': 2 }))
    ).toThrow('preceding addition');
    s.database.delete(eventTags).run();
    s.database.delete(tags).where(eq(tags.id, 'metadata')).run();
    expect(() =>
      s.apply(signed(s.input(true), 'other', 4, { 'test-device': 2 }))
    ).toThrow('endpoint was not found');
  } finally {
    s.sqlite.close();
  }
});

it('rolls back membership without touching the parent if recording fails', async () => {
  const s = await setup('event_person');
  try {
    expect(() =>
      s.database.transaction((tx) =>
        applyOperation(createOperation(s.input(true, future), tx), tx, {
          now: () => {
            throw new Error('failure');
          },
        })
      )
    ).toThrow('failure');
    expect(s.database.select().from(s.table).all()).toEqual([]);
    expect(s.database.select().from(events).get()?.updatedAt).toBe(at);
    expect(s.database.select().from(syncOperations).all()).toHaveLength(2);
  } finally {
    s.sqlite.close();
  }
});
