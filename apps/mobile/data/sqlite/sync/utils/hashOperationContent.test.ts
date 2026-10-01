import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { hashOperationContent } from './hashOperationContent';
import type { OperationContent } from '../types';

const operation: OperationContent = {
  originDeviceId: 'a',
  originSequence: 1,
  lamport: 2,
  causalContext: { b: 1, a: 0 },
  operationType: 'entity.patch',
  entityType: 'event',
  entityId: 'event-1',
  payload: {
    changes: { title: 'Travel', notes: 'Madrid' },
    updatedAt: '2026-09-12T00:00:00.000Z',
  },
};

it('matches an independently hashed canonical representation', () => {
  const canonical =
    '{"causalContext":{"a":0,"b":1},"entityId":"event-1","entityType":"event","lamport":2,"operationType":"entity.patch","originDeviceId":"a","originSequence":1,"payload":{"changes":{"notes":"Madrid","title":"Travel"},"updatedAt":"2026-09-12T00:00:00.000Z"}}';
  expect(hashOperationContent(operation)).toBe(
    `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
  );
});

it('ignores object insertion order and local bookkeeping', () => {
  expect(
    hashOperationContent({
      ...operation,
      causalContext: { a: 0, b: 1 },
      payload: {
        updatedAt: '2026-09-12T00:00:00.000Z',
        changes: { notes: 'Madrid', title: 'Travel' },
      },
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
  const hash = (orderedAttachmentIds: string[]) =>
    hashOperationContent({
      ...operation,
      operationType: 'event.attachment.reorder',
      entityType: 'event',
      payload: { orderedAttachmentIds, updatedAt: '2026-09-12T00:00:00.000Z' },
    });
  expect(hash(['a', 'b'])).not.toBe(hash(['b', 'a']));
  const nameHash = (name: string) =>
    hashOperationContent({
      ...operation,
      operationType: 'entity.patch',
      entityType: 'person',
      payload: { changes: { name }, updatedAt: '2026-09-12T00:00:00.000Z' },
    });
  expect(nameHash('\u00e9')).not.toBe(nameHash('e\u0301'));
  expect(nameHash('😀')).toMatch(/^sha256:[0-9a-f]{64}$/);
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
    hashOperationContent({
      ...operation,
      payload: { value },
    } as unknown as OperationContent)
  ).toThrow();
});

it('rejects cycles but permits shared objects', () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  expect(() =>
    hashOperationContent({
      ...operation,
      payload: cycle,
    } as unknown as OperationContent)
  ).toThrow();
  const shared = { name: 'value' };
  expect(() =>
    hashOperationContent({
      ...operation,
      payload: { a: shared, b: shared },
    } as unknown as OperationContent)
  ).not.toThrow();
});
