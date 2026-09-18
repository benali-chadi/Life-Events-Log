import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase } from '../../testing/createTestDatabase';
import {
  eventAttachments,
  events,
  syncConflicts,
  syncFieldVersions,
  syncOperations,
} from '../../schema';
import { createOperation } from '../createOperation';
import { applyOperation } from '../applyOperation';
import { hashOperationContent } from '../utils/hashOperationContent';
import type { CreateOperationInput, Operation, CausalContext } from '../types';

const at = '2026-09-17T00:00:00.000Z';
const later = '2026-09-18T00:00:00.000Z';
function signed(
  input: CreateOperationInput,
  origin: string,
  lamport: number,
  causalContext: CausalContext
): Operation {
  const content = {
    ...input,
    originDeviceId: origin,
    originSequence: 1,
    lamport,
    causalContext,
  };
  return { ...content, operationHash: hashOperationContent(content) };
}
const attachment = (id: string): CreateOperationInput => ({
  operationType: 'attachment.create',
  entityType: 'attachment',
  entityId: id,
  payload: {
    eventId: 'event',
    contentHash: 'a'.repeat(64),
    filename: id,
    mimeType: null,
    width: null,
    height: null,
    fileSize: null,
    sortOrder: 99,
    createdAt: at,
    updatedAt: at,
  },
});
const reorder = (ids: string[]): CreateOperationInput => ({
  operationType: 'event.attachment.reorder',
  entityType: 'event',
  entityId: 'event',
  payload: { orderedAttachmentIds: ids, updatedAt: later },
});
async function setup() {
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
      date: '2026-09-17',
      time: null,
      significance: 'ordinary',
      categoryId: null,
      locationId: null,
      notes: '',
      createdAt: at,
      updatedAt: at,
    },
  });
  for (const id of ['a', 'b', 'c']) local(attachment(id));
  const positions = () =>
    database
      .select()
      .from(eventAttachments)
      .all()
      .map((row) => [row.id, row.sortOrder]);
  return { ...result, apply, local, positions };
}

it('keeps list indices across tombstones and places omitted attachments afterwards', async () => {
  const s = await setup();
  try {
    s.local({
      operationType: 'attachment.delete',
      entityType: 'attachment',
      entityId: 'b',
      payload: { deletedAt: at },
    });
    const operation = signed(reorder(['c', 'b', 'a']), 'remote', 5, {
      'test-device': 4,
    });
    s.apply(operation);
    expect(s.positions()).toEqual([
      ['a', 2],
      ['b', 1],
      ['c', 0],
    ]);
    s.local(attachment('d'));
    expect(
      s.database
        .select()
        .from(eventAttachments)
        .all()
        .find((row) => row.id === 'd')?.sortOrder
    ).toBe(3);
    expect(s.database.select().from(events).get()?.updatedAt).toBe(at);
    expect(s.database.select().from(syncConflicts).all()).toEqual([]);
    expect(
      s.database
        .select()
        .from(syncOperations)
        .all()
        .find((row) => row.originDeviceId === 'remote')?.payload
    ).toEqual(operation.payload);
  } finally {
    s.sqlite.close();
  }
});

it('preserves local relative order of omitted attachments', async () => {
  const s = await setup();
  try {
    s.local(reorder(['c', 'b', 'a']));
    s.local(reorder(['a']));
    expect(s.positions()).toEqual([
      ['a', 0],
      ['b', 2],
      ['c', 1],
    ]);
    s.local(reorder([]));
    expect(s.positions()).toEqual([
      ['a', 0],
      ['b', 2],
      ['c', 1],
    ]);
  } finally {
    s.sqlite.close();
  }
});

it('converges the explicit list in either concurrent arrival order, then accepts a causal successor', async () => {
  for (const reverse of [false, true]) {
    const s = await setup();
    try {
      const operations = [
        signed(reorder(['a', 'b', 'c']), 'a', 5, { 'test-device': 4 }),
        signed(reorder(['c', 'b', 'a']), 'z', 5, { 'test-device': 4 }),
      ];
      for (const operation of reverse ? operations.reverse() : operations)
        s.apply(operation);
      expect(s.positions()).toEqual([
        ['a', 2],
        ['b', 1],
        ['c', 0],
      ]);
      expect(
        s.database
          .select()
          .from(syncFieldVersions)
          .all()
          .find((row) => row.fieldName === 'attachment_order')?.winnerDeviceId
      ).toBe('z');
      s.local(reorder(['b', 'a', 'c']));
      expect(s.positions()).toEqual([
        ['a', 1],
        ['b', 0],
        ['c', 2],
      ]);
      expect(s.database.select().from(syncConflicts).all()).toEqual([]);
    } finally {
      s.sqlite.close();
    }
  }
});

it('accepts either ordering of an omitted concurrent creation and reorder', async () => {
  for (const reverse of [false, true]) {
    const s = await setup();
    try {
      const operations = [
        signed(attachment('d'), 'create', 5, { 'test-device': 4 }),
        signed(reorder(['c', 'b', 'a']), 'reorder', 5, { 'test-device': 4 }),
      ];
      for (const operation of reverse ? operations.reverse() : operations)
        s.apply(operation);
      expect(s.positions()).toEqual([
        ['a', 2],
        ['b', 1],
        ['c', 0],
        ['d', 3],
      ]);
    } finally {
      s.sqlite.close();
    }
  }
});

it('rejects missing, foreign and noncausal attachment references without recording', async () => {
  const s = await setup();
  try {
    expect(() => s.local(reorder(['missing']))).toThrow('not found');
    expect(() =>
      s.apply(signed(reorder(['c']), 'remote', 5, { 'test-device': 1 }))
    ).toThrow('causally');
    s.database
      .insert(events)
      .values({
        id: 'other',
        title: 'Other',
        date: '2026-09-17',
        significance: 'ordinary',
        notes: '',
        createdAt: at,
        updatedAt: at,
      })
      .run();
    s.database
      .update(eventAttachments)
      .set({ eventId: 'other' })
      .where(eq(eventAttachments.id, 'c'))
      .run();
    expect(() => s.local(reorder(['c']))).toThrow('another event');
    expect(s.database.select().from(syncOperations).all()).toHaveLength(4);
  } finally {
    s.sqlite.close();
  }
});

it('rolls back positions and field versions if recording fails', async () => {
  const s = await setup();
  try {
    expect(() =>
      s.database.transaction((tx) =>
        applyOperation(createOperation(reorder(['c', 'b', 'a']), tx), tx, {
          now: () => {
            throw new Error('failure');
          },
        })
      )
    ).toThrow('failure');
    expect(s.positions()).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
    expect(
      s.database
        .select()
        .from(syncFieldVersions)
        .all()
        .some((row) => row.fieldName === 'attachment_order')
    ).toBe(false);
  } finally {
    s.sqlite.close();
  }
});

it('losing reorders write no domain state and superseded reorders stop contributing timestamps', async () => {
  const s = await setup();
  try {
    const future = '2030-01-01T00:00:00.000Z';
    const futureInput: CreateOperationInput = {
      operationType: 'event.attachment.reorder',
      entityType: 'event',
      entityId: 'event',
      payload: { orderedAttachmentIds: ['c', 'b', 'a'], updatedAt: future },
    };
    s.apply(signed(futureInput, 'a', 5, { 'test-device': 4 }));
    expect(
      s.database
        .select()
        .from(eventAttachments)
        .all()
        .every((row) => row.updatedAt === future)
    ).toBe(true);
    s.apply(signed(reorder(['a', 'b', 'c']), 'z', 5, { 'test-device': 4 }));
    expect(
      s.database
        .select()
        .from(eventAttachments)
        .all()
        .every((row) => row.updatedAt === later)
    ).toBe(true);
    const before = s.database.select().from(eventAttachments).all();
    s.apply(signed(futureInput, 'b', 5, { 'test-device': 4 }));
    expect(s.database.select().from(eventAttachments).all()).toEqual(before);
    expect(s.database.select().from(events).get()?.updatedAt).toBe(at);
  } finally {
    s.sqlite.close();
  }
});
