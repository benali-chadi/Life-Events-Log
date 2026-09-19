import { expect, it } from 'vitest';
import { createTestDatabase } from '../../testing/createTestDatabase';
import {
  eventAttachments,
  events,
  syncOperations,
  syncPendingOperations,
  syncConflicts,
  syncFieldVersions,
} from '../../schema';
import { applyOperation } from '../applyOperation';
import { createOperation } from '../createOperation';
import { hashOperationContent } from '../utils/hashOperationContent';
import type { CreateOperationInput, Operation, CausalContext } from '../types';
import { SQLiteAttachmentRepository } from '../../repositories/SQLiteAttachmentRepository';

const at = '2026-09-17T00:00:00.000Z';
const future = '2030-01-01T00:00:00.000Z';
const payload = {
  eventId: 'event',
  contentHash: 'a'.repeat(64),
  filename: 'image.png',
  mimeType: 'image/png',
  width: null,
  height: null,
  fileSize: null,
  sortOrder: 0,
  createdAt: at,
  updatedAt: at,
};
const create: CreateOperationInput = {
  operationType: 'attachment.create',
  entityType: 'attachment',
  entityId: 'image',
  payload,
};
function signed(
  input: CreateOperationInput,
  originDeviceId: string,
  lamport: number,
  causalContext: CausalContext
): Operation {
  const content = {
    ...input,
    originDeviceId,
    originSequence: 1,
    lamport,
    causalContext,
  };
  return { ...content, operationHash: hashOperationContent(content) };
}
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
  return { ...result, apply, local };
}

it('creates rows with shared hashes, records versions, and never updates the parent', async () => {
  const s = await setup();
  try {
    s.local(create);
    s.local({ ...create, entityId: 'second' });
    expect(s.database.select().from(eventAttachments).all()).toHaveLength(2);
    expect(
      s.database
        .select()
        .from(syncFieldVersions)
        .all()
        .filter((row) => row.entityId === 'image')
        .map((row) => row.fieldName)
    ).toContain('content_hash');
    s.local({
      operationType: 'attachment.delete',
      entityType: 'attachment',
      entityId: 'image',
      payload: { deletedAt: future },
    });
    expect(s.database.select().from(eventAttachments).all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'image',
          deletedAt: future,
          updatedAt: future,
        }),
        expect.objectContaining({
          id: 'second',
          deletedAt: null,
          contentHash: payload.contentHash,
        }),
      ])
    );
    expect(s.database.select().from(events).get()?.updatedAt).toBe(at);
    expect(s.database.select().from(syncConflicts).all()).toEqual([]);
  } finally {
    s.sqlite.close();
  }
});

it('converges concurrent deletions in either order, excluding losing timestamps', async () => {
  const states: unknown[] = [];
  for (const reverse of [false, true]) {
    const s = await setup();
    try {
      s.local(create);
      const deletion = (origin: string, deletedAt: string) =>
        signed(
          {
            operationType: 'attachment.delete',
            entityType: 'attachment',
            entityId: 'image',
            payload: { deletedAt },
          },
          origin,
          3,
          { 'test-device': 2 }
        );
      const operations = [deletion('a', future), deletion('z', at)];
      for (const operation of reverse ? operations.reverse() : operations)
        s.apply(operation);
      states.push({
        row: s.database.select().from(eventAttachments).get(),
        versions: s.database.select().from(syncFieldVersions).all(),
      });
      expect(s.database.select().from(eventAttachments).get()).toMatchObject({
        deletedAt: at,
        updatedAt: at,
      });
      expect(s.database.select().from(syncOperations).all()).toHaveLength(4);
      expect(s.apply(operations[0]!)).toBe('already-applied');
    } finally {
      s.sqlite.close();
    }
  }
  expect(states[0]).toEqual(states[1]);
});

it('accepts attachment creation concurrent with parent deletion, without restoring the parent', async () => {
  const s = await setup();
  try {
    s.local({
      operationType: 'entity.delete',
      entityType: 'event',
      entityId: 'event',
      payload: { deletedAt: at },
    });
    s.apply(signed(create, 'remote', 2, { 'test-device': 1 }));
    expect(
      s.database.select().from(eventAttachments).get()?.deletedAt
    ).toBeNull();
    expect(s.database.select().from(events).get()?.deletedAt).toBe(at);
    s.apply(
      signed(
        {
          operationType: 'attachment.delete',
          entityType: 'attachment',
          entityId: 'image',
          payload: { deletedAt: future },
        },
        'delete',
        3,
        { 'test-device': 1, remote: 1 }
      )
    );
    expect(s.database.select().from(eventAttachments).get()?.deletedAt).toBe(
      future
    );
  } finally {
    s.sqlite.close();
  }
});

it('rejects missing/noncausal creation and never recreates tombstoned identities', async () => {
  const s = await setup();
  try {
    expect(() => s.apply(signed(create, 'bad', 2, {}))).toThrow('causally');
    expect(() =>
      s.local({ ...create, payload: { ...payload, eventId: 'missing' } })
    ).toThrow('parent event');
    expect(() =>
      s.local({
        operationType: 'attachment.delete',
        entityType: 'attachment',
        entityId: 'image',
        payload: { deletedAt: at },
      })
    ).toThrow('not found');
    s.local(create);
    expect(() =>
      s.apply(
        signed(
          {
            operationType: 'attachment.delete',
            entityType: 'attachment',
            entityId: 'image',
            payload: { deletedAt: at },
          },
          'bad',
          3,
          { 'test-device': 1 }
        )
      )
    ).toThrow('causally');
    s.local({
      operationType: 'attachment.delete',
      entityType: 'attachment',
      entityId: 'image',
      payload: { deletedAt: at },
    });
    expect(() => s.local(create)).toThrow('identity');
    expect(s.database.select().from(syncOperations).all()).toHaveLength(3);
  } finally {
    s.sqlite.close();
  }
});

it('rolls back an inserted attachment if recording fails', async () => {
  const s = await setup();
  try {
    expect(() =>
      s.database.transaction((tx) =>
        applyOperation(createOperation(create, tx), tx, {
          now: () => {
            throw new Error('failure');
          },
        })
      )
    ).toThrow('failure');
    expect(s.database.select().from(eventAttachments).all()).toEqual([]);
    expect(s.database.select().from(syncOperations).all()).toHaveLength(1);
  } finally {
    s.sqlite.close();
  }
});

it('compacts repository create/delete and validates batches atomically', async () => {
  const s = await setup();
  try {
    let next = 0;
    const repo = new SQLiteAttachmentRepository(s.database, {
      createId: () => `image-${++next}`,
      now: () => at,
    });
    await repo.create(payload);
    await repo.create(payload);
    await expect(repo.softDeleteMany(['image-1', 'missing'])).rejects.toThrow();
    expect(s.database.select().from(syncOperations).all()).toHaveLength(1);
    expect(s.database.select().from(syncPendingOperations).all()).toHaveLength(
      2
    );
    await repo.softDeleteMany(['image-1', 'image-2']);
    expect(s.database.select().from(syncOperations).all()).toHaveLength(1);
    expect(s.database.select().from(syncPendingOperations).all()).toEqual([]);
    expect(s.database.select().from(eventAttachments).all()).toEqual([]);
  } finally {
    s.sqlite.close();
  }
});
