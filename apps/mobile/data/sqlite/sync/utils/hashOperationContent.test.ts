import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { hashOperationContent } from './hashOperationContent';
import type { OperationContent, JsonObject } from '../types';

const operation: OperationContent = {
  originDeviceId: 'a',
  originSequence: 1,
  lamport: 2,
  causalContext: { b: 1, a: 0 },
  operationType: 'entity.patch',
  entityType: 'event',
  entityId: 'event-1',
  payload: { changes: { title: 'Travel', notes: 'Madrid' } },
};

it('matches an independently hashed canonical representation', () => {
  const canonical =
    '{"causalContext":{"a":0,"b":1},"entityId":"event-1","entityType":"event","lamport":2,"operationType":"entity.patch","originDeviceId":"a","originSequence":1,"payload":{"changes":{"notes":"Madrid","title":"Travel"}}}';
  expect(hashOperationContent(operation)).toBe(
    `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
  );
});

it('ignores object insertion order and local bookkeeping', () => {
  expect(
    hashOperationContent({
      ...operation,
      causalContext: { a: 0, b: 1 },
      payload: { changes: { notes: 'Madrid', title: 'Travel' } },
    })
  ).toBe(hashOperationContent(operation));
  const stored = {
    ...operation,
    operationHash: 'ignored',
    receivedAt: 'later',
    appliedAt: 'later',
  };
  expect(hashOperationContent(stored)).toBe(hashOperationContent(operation));
});

it('preserves array order and Unicode spelling', () => {
  const hash = (payload: JsonObject) =>
    hashOperationContent({ ...operation, payload });
  expect(hash({ ids: ['a', 'b'] })).not.toBe(hash({ ids: ['b', 'a'] }));
  expect(hash({ name: '\u00e9' })).not.toBe(hash({ name: 'e\u0301' }));
  expect(hash({ name: '😀' })).toMatch(/^sha256:[0-9a-f]{64}$/);
});

it.each([
  undefined,
  NaN,
  Infinity,
  new Date(),
  '\ud800',
  '\udc00',
  1n,
  () => 1,
  new Array(1),
])('rejects invalid JSON payload values (%s)', (value) => {
  expect(() =>
    hashOperationContent({ ...operation, payload: { value } as JsonObject })
  ).toThrow();
});

it('rejects cycles but permits shared objects', () => {
  const cycle: JsonObject = {};
  cycle.self = cycle;
  expect(() =>
    hashOperationContent({ ...operation, payload: cycle })
  ).toThrow();
  const shared = { name: 'value' };
  expect(() =>
    hashOperationContent({ ...operation, payload: { a: shared, b: shared } })
  ).not.toThrow();
});
