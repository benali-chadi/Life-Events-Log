import { afterEach, beforeEach, expect, it } from 'vitest';
import type { Database } from 'sql.js';
import type { AppDatabase } from '../../database';
import { syncFrontiers, syncLocalState, syncOperations } from '../../schema';
import { createTestDatabase } from '../../testing/createTestDatabase';
import {
  validateOperation,
  type EnvelopeValidatedOperation,
} from './validateOperation';
import { hashOperationContent } from '../utils/hashOperationContent';
import { createOperation } from '../createOperation';
import { appendOperation } from '../recording/appendOperation';

let sqlite: Database;
let database: AppDatabase;
const at = '2026-09-14T00:00:00.000Z';
function candidate(
  overrides: Partial<EnvelopeValidatedOperation> = {}
): EnvelopeValidatedOperation {
  const content = {
    originDeviceId: 'remote',
    originSequence: 1,
    lamport: 1,
    causalContext: {},
    operationType: 'entity.patch' as const,
    entityType: 'event' as const,
    entityId: 'not-a-uuid',
    payload: { changes: { title: 'Hello' }, updatedAt: at },
    ...overrides,
  };
  return { ...content, operationHash: hashOperationContent(content) };
}
function store(operation: EnvelopeValidatedOperation) {
  // Fixtures represent previously accepted history; payload rules are outside these tests.
  database
    .insert(syncOperations)
    .values({
      ...operation,
      payload: operation.payload as { deletedAt: string },
      receivedAt: at,
      appliedAt: at,
    })
    .run();
  database
    .insert(syncFrontiers)
    .values({
      originDeviceId: operation.originDeviceId,
      processedSequence: operation.originSequence,
    })
    .run();
}
const validate = (input: unknown) =>
  database.transaction((tx) => validateOperation(input, tx));
beforeEach(async () => {
  ({ sqlite, database } = await createTestDatabase());
});
afterEach(() => sqlite.close());

it('accepts a new operation without UUID checks or database writes', () => {
  const operation = candidate();
  expect(validate(operation)).toEqual({ status: 'ready', operation });
  expect(database.select().from(syncOperations).all()).toEqual([]);
  expect(database.select().from(syncFrontiers).all()).toEqual([]);
  expect(database.select().from(syncLocalState).all()).toEqual([]);
});

it('validates payload rules as well as JSON integrity', () => {
  expect(() =>
    validate(candidate({ payload: { arbitrary: 'not a valid event patch' } }))
  ).toThrow('unsupported field');
  expect(() =>
    validate({ ...candidate(), payload: { value: undefined } })
  ).toThrow('canonicalizable');
});

it.each([
  null,
  [],
  {},
  { ...candidate(), extra: true },
  { ...candidate(), receivedAt: at },
  { ...candidate(), originDeviceId: '' },
  { ...candidate(), entityId: 1 },
  { ...candidate(), originSequence: 0 },
  { ...candidate(), originSequence: Number.MAX_SAFE_INTEGER + 1 },
  { ...candidate(), lamport: 1.5 },
  { ...candidate(), operationType: 'unknown' },
  { ...candidate(), entityType: 'unknown' },
  { ...candidate(), operationType: 'attachment.create', entityType: 'event' },
  { ...candidate(), causalContext: [] },
  { ...candidate(), causalContext: { '': 0 } },
  { ...candidate(), causalContext: { remote: -1 } },
  { ...candidate(), causalContext: { remote: 1 } },
  { ...candidate(), operationHash: 'invalid' },
])('rejects malformed envelopes (%#)', (input) => {
  expect(() => validate(input)).toThrow();
});

it('rejects tampering and accessors without executing them', () => {
  expect(() => validate({ ...candidate(), entityId: 'changed' })).toThrow(
    'hash does not match'
  );
  const input = candidate();
  let accessed = false;
  Object.defineProperty(input, 'payload', {
    enumerable: true,
    get() {
      accessed = true;
      return {};
    },
  });
  expect(() => validate(input)).toThrow('JSON properties');
  expect(accessed).toBe(false);
});

it('recognizes duplicates and rejects conflicting content under the same identity', () => {
  const operation = candidate();
  store(operation);
  expect(validate(operation).status).toBe('already-applied');
  expect(() => validate(candidate({ entityId: 'different' }))).toThrow(
    'conflicting content'
  );
  expect(database.select().from(syncOperations).all()).toHaveLength(1);
});

it('rejects gaps and missing dependencies without advancing frontiers', () => {
  expect(() =>
    validate(candidate({ originSequence: 2, causalContext: { remote: 1 } }))
  ).toThrow('preceding origin');
  expect(() =>
    validate(candidate({ causalContext: { other: 1 }, lamport: 2 }))
  ).toThrow('Missing causal dependency');
  expect(database.select().from(syncFrontiers).all()).toEqual([]);
});

it('accepts causal successors and lower-clock concurrent operations', () => {
  store(candidate({ originDeviceId: 'other', lamport: 100 }));
  expect(validate(candidate()).status).toBe('ready');
  expect(
    validate(candidate({ causalContext: { other: 1 }, lamport: 101 })).status
  ).toBe('ready');
  expect(() =>
    validate(candidate({ causalContext: { other: 1 }, lamport: 100 }))
  ).toThrow('Lamport');
});

it('rejects contexts that omit transitive predecessor dependencies', () => {
  store(candidate({ originDeviceId: 'ancestor' }));
  store(
    candidate({
      originDeviceId: 'other',
      lamport: 2,
      causalContext: { ancestor: 1 },
    })
  );
  expect(() =>
    validate(candidate({ lamport: 3, causalContext: { other: 1 } }))
  ).toThrow('omits a predecessor');
  expect(
    validate(
      candidate({ lamport: 3, causalContext: { other: 1, ancestor: 1 } })
    ).status
  ).toBe('ready');
});

it('fails on a frontier claiming history that is not retained', () => {
  database
    .insert(syncFrontiers)
    .values({ originDeviceId: 'remote', processedSequence: 1 })
    .run();
  expect(() => validate(candidate())).toThrow('missing from local history');
  expect(() =>
    validate(
      candidate({
        originDeviceId: 'another',
        causalContext: { remote: 1 },
        lamport: 2,
      })
    )
  ).toThrow('missing from local history');
});

it('sees operations appended earlier in the same transaction', () => {
  database
    .insert(syncLocalState)
    .values({ deviceId: 'local', observedLamport: 0 })
    .run();
  database.transaction((tx) => {
    const input = {
      operationType: 'entity.patch' as const,
      entityType: 'event' as const,
      entityId: 'event',
      payload: { changes: { title: 'Title' }, updatedAt: at },
    };
    const first = createOperation(input, tx);
    expect(validateOperation(first, tx).status).toBe('ready');
    appendOperation(first, tx, [], { now: () => at });
    expect(validateOperation(first, tx).status).toBe('already-applied');
    expect(validateOperation(createOperation(input, tx), tx).status).toBe(
      'ready'
    );
  });
});
