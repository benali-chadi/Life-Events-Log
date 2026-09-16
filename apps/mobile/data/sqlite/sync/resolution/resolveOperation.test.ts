import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import type { AppDatabase } from '../../database';
import {
  events,
  syncOperations,
  syncFieldVersions,
  syncConflicts,
  categories,
} from '../../schema';
import { createTestDatabase } from '../../testing/createTestDatabase';
import { applyOperation } from '../applyOperation';
import { createOperation } from '../createOperation';
import { hashOperationContent } from '../utils/hashOperationContent';
import { compareOperations } from './operationOrder';
import type { CreateOperationInput, Operation, CausalContext } from '../types';

let sqlite: Database;
let database: AppDatabase;
const at = '2026-09-16T00:00:00.000Z';
const future = '2030-01-01T00:00:00.000Z';
function op(
  input: CreateOperationInput,
  originDeviceId: string,
  lamport: number,
  causalContext: CausalContext = { seed: 1 },
  originSequence = 1
): Operation {
  const content = {
    ...input,
    originDeviceId,
    originSequence,
    lamport,
    causalContext,
  };
  return { ...content, operationHash: hashOperationContent(content) };
}
const creation = op(
  {
    operationType: 'entity.create',
    entityType: 'event',
    entityId: 'event',
    payload: {
      title: 'Original',
      date: '2026-09-16',
      time: null,
      significance: 'ordinary',
      categoryId: null,
      locationId: null,
      notes: '',
      createdAt: at,
      updatedAt: at,
    },
  },
  'seed',
  1,
  {}
);
function patch(
  origin: string,
  title: string,
  lamport = 2,
  context: CausalContext = { seed: 1 },
  timestamp = at,
  sequence = 1
) {
  return op(
    {
      operationType: 'entity.patch',
      entityType: 'event',
      entityId: 'event',
      payload: { changes: { title }, updatedAt: timestamp },
    },
    origin,
    lamport,
    context,
    sequence
  );
}
function deletion(origin: string, lamport = 2, timestamp = at) {
  return op(
    {
      operationType: 'entity.delete',
      entityType: 'event',
      entityId: 'event',
      payload: { deletedAt: timestamp },
    },
    origin,
    lamport
  );
}
function apply(operation: Operation, db = database) {
  return db.transaction((tx) =>
    applyOperation(operation, tx, { now: () => at })
  );
}
beforeEach(async () => {
  ({ sqlite, database } = await createTestDatabase({
    initializeSyncState: true,
  }));
  apply(creation);
});
afterEach(() => sqlite.close());

it('merges disjoint fields, and a causal edit wins without a conflict', () => {
  apply(patch('a', 'A'));
  apply(
    op(
      {
        operationType: 'entity.patch',
        entityType: 'event',
        entityId: 'event',
        payload: { changes: { notes: 'Notes' }, updatedAt: at },
      },
      'b',
      2
    )
  );
  apply(patch('c', 'C', 3, { seed: 1, a: 1 }));
  expect(database.select().from(events).get()).toMatchObject({
    title: 'C',
    notes: 'Notes',
  });
  expect(database.select().from(syncConflicts).all()).toEqual([]);
});

it('converges values, versions and max timestamps for every order of three concurrent edits', async () => {
  const operations = [
    patch('a', 'A', 2, { seed: 1 }, future),
    patch('b', 'B'),
    patch('c', 'C'),
  ];
  let baseline: unknown;
  for (const order of [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ]) {
    const other = await createTestDatabase({ initializeSyncState: true });
    try {
      apply(creation, other.database);
      for (const i of order) apply(operations[i]!, other.database);
      const state = {
        event: other.database.select().from(events).get(),
        versions: other.database.select().from(syncFieldVersions).all(),
      };
      if (baseline) expect(state).toEqual(baseline);
      else baseline = state;
      expect(state.event).toMatchObject({ title: 'C', updatedAt: future });
      expect(other.database.select().from(syncConflicts).all()).toHaveLength(1);
    } finally {
      other.sqlite.close();
    }
  }
});

it('does not create a conflict for concurrent equal values', () => {
  apply(patch('a', 'Same'));
  apply(patch('b', 'Same'));
  expect(database.select().from(syncConflicts).all()).toEqual([]);
  expect(
    database
      .select()
      .from(syncFieldVersions)
      .all()
      .find((row) => row.fieldName === 'title')?.winnerDeviceId
  ).toBe('b');
});

it('preserves the revised alternative when a causal successor replaces the winner without seeing it', () => {
  apply(patch('z', 'Winner', 10));
  apply(patch('a', 'Alternative'));
  apply(patch('a', 'Revised', 3, { seed: 1, a: 1 }, at, 2));
  expect(database.select().from(syncConflicts).all()).toHaveLength(1);
  expect(database.select().from(syncConflicts).get()).toMatchObject({
    winningDeviceId: 'z',
    losingDeviceId: 'a',
    losingSequence: 2,
  });
  apply(patch('c', 'New winner', 11, { seed: 1, z: 1 }));
  expect(database.select().from(syncConflicts).all()).toHaveLength(1);
  expect(database.select().from(syncConflicts).get()).toMatchObject({
    winningDeviceId: 'c',
    losingDeviceId: 'a',
    losingSequence: 2,
  });
  apply(patch('d', 'Resolved', 12, { seed: 1, z: 1, a: 2, c: 1 }));
  expect(database.select().from(syncConflicts).all()).toEqual([]);
});

it('preserves the original alternative across concurrent incoming winners', () => {
  apply(patch('a', 'Original alternative'));
  apply(patch('b', 'First winner'));
  const conflict = database.select().from(syncConflicts).get()!;
  apply(patch('c', 'Second winner'));
  apply(patch('d', 'Third winner'));
  expect(database.select().from(syncConflicts).all()).toHaveLength(1);
  expect(database.select().from(syncConflicts).get()).toMatchObject({
    conflictId: conflict.conflictId,
    winningDeviceId: 'd',
    losingDeviceId: 'a',
  });
});

it('a newly created local edit naturally acknowledges and clears both alternatives', () => {
  apply(patch('a', 'A'));
  apply(patch('b', 'B'));
  database.transaction((tx) => {
    const operation = createOperation(
      {
        operationType: 'entity.patch',
        entityType: 'event',
        entityId: 'event',
        payload: { changes: { title: 'Chosen locally' }, updatedAt: at },
      },
      tx
    );
    expect(operation.causalContext).toMatchObject({ a: 1, b: 1 });
    applyOperation(operation, tx);
  });
  expect(database.select().from(syncConflicts).all()).toEqual([]);
});

it('replaces an acknowledged alternative with the previous winner when still concurrent with that winner', () => {
  apply(patch('a', 'A'));
  apply(patch('b', 'B'));
  apply(patch('c', 'C', 3, { seed: 1, a: 1 }));
  expect(database.select().from(syncConflicts).get()).toMatchObject({
    winningDeviceId: 'c',
    losingDeviceId: 'b',
  });
});

it('does not retain an alternative whose value has become the displayed value', () => {
  apply(patch('a', 'A'));
  apply(patch('b', 'B'));
  apply(patch('c', 'A', 3, { seed: 1, b: 1 }));
  expect(database.select().from(events).get()?.title).toBe('A');
  expect(database.select().from(syncConflicts).all()).toEqual([]);
});

it('permanent deletion suppresses concurrent and causal-later patches but records their timestamps', () => {
  apply(patch('a', 'A'));
  apply(patch('b', 'B'));
  apply(deletion('d'));
  expect(database.select().from(syncConflicts).all()).toEqual([]);
  apply(patch('z', 'Must not restore', 100, { seed: 1, d: 1 }, future));
  expect(database.select().from(events).get()).toMatchObject({
    title: 'B',
    deletedAt: at,
    updatedAt: future,
  });
  expect(
    database
      .select()
      .from(syncFieldVersions)
      .all()
      .find((row) => row.fieldName === 'title')?.winnerDeviceId
  ).toBe('b');
  expect(database.select().from(syncOperations).all()).toHaveLength(5);
});

it('chooses a deterministic delete winner but includes losing-delete timestamps', async () => {
  for (const order of [
    [deletion('a', 2, future), deletion('b')],
    [deletion('b'), deletion('a', 2, future)],
  ]) {
    const other = await createTestDatabase({ initializeSyncState: true });
    try {
      apply(creation, other.database);
      for (const operation of order) apply(operation, other.database);
      expect(other.database.select().from(events).get()).toMatchObject({
        deletedAt: at,
        updatedAt: future,
      });
      expect(
        other.database
          .select()
          .from(syncFieldVersions)
          .all()
          .find((row) => row.fieldName === 'deleted_at')?.winnerDeviceId
      ).toBe('b');
    } finally {
      other.sqlite.close();
    }
  }
});

it('rejects edits that do not include creation and different creates for the same identity', () => {
  expect(() => apply(patch('bad', 'Bad', 2, {}))).toThrow('causally include');
  expect(() =>
    apply(
      op(
        {
          operationType: 'entity.delete',
          entityType: 'event',
          entityId: 'event',
          payload: { deletedAt: at },
        },
        'bad',
        2,
        {}
      )
    )
  ).toThrow('causally include');
  expect(() =>
    apply(
      op(
        {
          operationType: 'entity.create',
          entityType: 'event',
          entityId: 'event',
          payload: creation.payload,
        } as CreateOperationInput,
        'bad',
        2
      )
    )
  ).toThrow('identity');
  expect(database.select().from(syncOperations).all()).toHaveLength(1);
});

it('rejects incoming edits to legacy entities that have no creation history', () => {
  database
    .insert(categories)
    .values({
      id: 'legacy',
      name: 'Legacy',
      normalizedName: 'legacy',
      color: 'blue',
      createdAt: at,
      updatedAt: at,
    })
    .run();
  expect(() =>
    apply(
      op(
        {
          operationType: 'entity.patch',
          entityType: 'category',
          entityId: 'legacy',
          payload: { changes: { name: 'Other' }, updatedAt: at },
        },
        'remote',
        2
      )
    )
  ).toThrow('bootstrap');
});

it('rolls back conflict bookkeeping and mutations when appending fails', () => {
  apply(patch('a', 'A'));
  expect(() =>
    database.transaction((tx) =>
      applyOperation(patch('b', 'B'), tx, {
        now: () => {
          throw new Error('failure');
        },
      })
    )
  ).toThrow('failure');
  expect(database.select().from(events).get()?.title).toBe('A');
  expect(database.select().from(syncConflicts).all()).toEqual([]);
  expect(database.select().from(syncOperations).all()).toHaveLength(2);
});

it('uses Lamport, then fixed device ordering, then sequence', () => {
  expect(compareOperations(patch('a', 'A', 3), patch('z', 'Z', 2))).toBe(1);
  expect(compareOperations(patch('z', 'Z'), patch('a', 'A'))).toBe(1);
  expect(
    compareOperations(patch('a', 'A', 2, {}, at, 2), patch('a', 'A'))
  ).toBe(1);
});

it('selects a different winner independently for each field of one patch', () => {
  apply(patch('z', 'Title winner', 10));
  apply(
    op(
      {
        operationType: 'entity.patch',
        entityType: 'event',
        entityId: 'event',
        payload: {
          changes: { title: 'Losing title', notes: 'Winning notes' },
          updatedAt: at,
        },
      },
      'a',
      2
    )
  );
  expect(database.select().from(events).get()).toMatchObject({
    title: 'Title winner',
    notes: 'Winning notes',
  });
  const versions = database.select().from(syncFieldVersions).all();
  expect(
    versions.find((row) => row.fieldName === 'title')?.winnerDeviceId
  ).toBe('z');
  expect(
    versions.find((row) => row.fieldName === 'notes')?.winnerDeviceId
  ).toBe('a');
  expect(database.select().from(syncConflicts).all()).toHaveLength(1);
  expect(database.select().from(syncConflicts).get()?.conflictId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
});

it('a normal patch acknowledging both alternatives clears the conflict', () => {
  apply(patch('a', 'A'));
  apply(patch('b', 'B'));
  apply(patch('c', 'Resolved', 3, { seed: 1, a: 1, b: 1 }));
  expect(database.select().from(events).get()?.title).toBe('Resolved');
  expect(database.select().from(syncConflicts).all()).toEqual([]);
});

it('delete remains effective regardless of concurrent patch arrival order', async () => {
  for (const order of [
    [patch('p', 'Edit', 3, { seed: 1 }, future), deletion('d')],
    [deletion('d'), patch('p', 'Edit', 3, { seed: 1 }, future)],
  ]) {
    const other = await createTestDatabase({ initializeSyncState: true });
    try {
      apply(creation, other.database);
      for (const operation of order) apply(operation, other.database);
      expect(other.database.select().from(events).get()).toMatchObject({
        deletedAt: at,
        updatedAt: future,
      });
      expect(other.database.select().from(syncConflicts).all()).toEqual([]);
      expect(other.database.select().from(syncOperations).all()).toHaveLength(
        3
      );
    } finally {
      other.sqlite.close();
    }
  }
});
