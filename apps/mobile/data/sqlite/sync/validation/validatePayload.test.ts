import { describe, expect, it } from 'vitest';
import { validatePayload } from './validatePayload';
import { OperationValidationError } from './OperationValidationError';
import type { Operation, OperationType, SyncEntityType } from '../types';

const at = '2026-09-14T00:00:00.000Z';
const timestamps = { createdAt: at, updatedAt: at };
const event = {
  title: 'Hello',
  date: '2024-02-29',
  time: null,
  significance: 'ordinary',
  categoryId: null,
  locationId: null,
  notes: '',
  ...timestamps,
};
const attachment = {
  eventId: 'event',
  contentHash: 'a'.repeat(64),
  filename: 'photo.png',
  mimeType: 'image/png',
  width: null,
  height: null,
  fileSize: null,
  sortOrder: 0,
  ...timestamps,
};
function check(
  operationType: OperationType,
  entityType: SyncEntityType,
  payload: unknown,
  entityId = 'id'
) {
  const operation = {
    originDeviceId: 'device',
    originSequence: 1,
    lamport: 1,
    causalContext: {},
    operationHash: '',
    operationType,
    entityType,
    entityId,
    payload,
  };
  validatePayload(operation);
  const validated: Operation = operation;
  return validated;
}

describe('validatePayload', () => {
  it.each(['event', 'category', 'tag', 'person', 'location'] as const)(
    'accepts create, patch and delete for %s',
    (entity) => {
      const fields =
        entity === 'event'
          ? event
          : entity === 'category'
            ? { name: 'Name', color: 'blue', ...timestamps }
            : { name: 'Name', ...timestamps };
      check('entity.create', entity, fields);
      check('entity.patch', entity, {
        changes: entity === 'event' ? { title: 'New' } : { name: 'New' },
        updatedAt: at,
      });
      check('entity.delete', entity, { deletedAt: at });
    }
  );
  it.each(['event_tag', 'event_person'] as const)(
    'checks composite endpoints for %s',
    (entity) => {
      const endpoints = {
        eventId: 'event',
        [entity === 'event_tag' ? 'tagId' : 'personId']: 'metadata',
      };
      const identity = JSON.stringify(['event', 'metadata']);
      check('relation.add', entity, { ...endpoints, ...timestamps }, identity);
      check(
        'relation.remove',
        entity,
        { ...endpoints, deletedAt: at },
        identity
      );
      expect(() =>
        check('relation.add', entity, { ...endpoints, ...timestamps })
      ).toThrow('canonical relation endpoints');
    }
  );
  it('accepts attachment creation, deletion and empty or non-UUID reorder lists', () => {
    check('attachment.create', 'attachment', attachment);
    check('attachment.delete', 'attachment', { deletedAt: at });
    check('event.attachment.reorder', 'event', {
      orderedAttachmentIds: [],
      updatedAt: at,
    });
    check('event.attachment.reorder', 'event', {
      orderedAttachmentIds: ['missing-locally', 'tombstoned'],
      updatedAt: at,
    });
  });
  it.each([
    null,
    [],
    {},
    { ...event, extra: true },
    { ...event, id: 'id' },
    { ...event, time: undefined },
  ])('rejects invalid creation shape %#', (payload) => {
    expect(() => check('entity.create', 'event', payload)).toThrow(
      OperationValidationError
    );
  });
  it.each([
    {},
    { id: 'id' },
    { deletedAt: at },
    { createdAt: at },
    { updatedAt: at },
    { title: null },
    { notes: null },
    { date: '2023-02-29' },
    { date: '2024-13-01' },
    { time: '24:00' },
    { time: '9:00' },
    { title: '  Hello' },
    { title: 'Hello  world' },
    { title: 'x'.repeat(101) },
    { significance: 'invalid' },
    { categoryId: '' },
  ])('rejects invalid event changes %#', (changes) => {
    expect(() =>
      check('entity.patch', 'event', { changes, updatedAt: at })
    ).toThrow(OperationValidationError);
  });
  it('preserves notes and allows explicit nullable fields and early calendar years', () => {
    const payload = {
      changes: {
        notes: '  **Notes**\n\n',
        time: null,
        categoryId: null,
        locationId: null,
        date: '0099-01-01',
      },
      updatedAt: at,
    };
    expect(check('entity.patch', 'event', payload).payload).toBe(payload);
  });
  it.each([
    '',
    'invalid',
    '2026-02-30T00:00:00.000Z',
    '2026-09-14T00:00:00Z',
    '2026-09-14T00:00:00.000+00:00',
    null,
  ])('rejects malformed deletion timestamps %s', (deletedAt) => {
    expect(() => check('entity.delete', 'event', { deletedAt })).toThrow(
      OperationValidationError
    );
  });
  it.each([
    { name: '' },
    { name: ' A ' },
    { name: 'A  B' },
    { color: 'invalid' },
    { name: null },
  ])('rejects invalid category changes %#', (changes) => {
    expect(() =>
      check('entity.patch', 'category', { changes, updatedAt: at })
    ).toThrow(OperationValidationError);
  });
  it.each([
    { contentHash: 'A'.repeat(64) },
    { contentHash: 'abc' },
    { filename: ' ' },
    { filename: ' a.png' },
    { width: 0 },
    { height: -1 },
    { width: 1.5 },
    { fileSize: -1 },
    { fileSize: Number.MAX_SAFE_INTEGER + 1 },
    { sortOrder: -1 },
    { mimeType: 'Image/PNG' },
  ])('rejects invalid attachment values %#', (changes) => {
    expect(() =>
      check('attachment.create', 'attachment', { ...attachment, ...changes })
    ).toThrow(OperationValidationError);
  });
  it('retains nullable MIME and numeric metadata support', () => {
    check('attachment.create', 'attachment', {
      ...attachment,
      mimeType: null,
      width: 1,
      height: 1,
      fileSize: 0,
    });
  });
  it.each(
    [['a', 'a'], [''], [1], [null], 'a'].map((orderedAttachmentIds) => ({
      orderedAttachmentIds,
    }))
  )('rejects malformed reorder IDs %#', ({ orderedAttachmentIds }) => {
    expect(() =>
      check('event.attachment.reorder', 'event', {
        orderedAttachmentIds,
        updatedAt: at,
      })
    ).toThrow(OperationValidationError);
  });
});
