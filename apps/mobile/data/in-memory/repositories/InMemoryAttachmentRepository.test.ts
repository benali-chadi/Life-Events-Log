import {
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type CreateAttachmentInput,
  type RepositoryDependencies,
} from '@/data/repositories';
import type { EventAttachment } from '@/models';
import { describe, expect, it } from 'vitest';
import { createInMemoryDatabase } from '../createInMemoryDatabase';
import { DEVELOPMENT_SEED } from '../seed';
import { InMemoryAttachmentRepository } from './InMemoryAttachmentRepository';

const ATTACHMENT_ID = '90000000-0000-4000-8000-000000000001';
const NOW = '2026-07-31T10:00:00.000Z';
const EVENT_ID = DEVELOPMENT_SEED.events[0]!.id;

function dependencies(id = ATTACHMENT_ID): RepositoryDependencies {
  return {
    createId: () => id,
    now: () => NOW,
  };
}

function attachment(
  id: string,
  sortOrder: number,
  createdAt: string,
  overrides: Partial<EventAttachment> = {}
): EventAttachment {
  return {
    id,
    eventId: EVENT_ID,
    relativePath: `attachments/${id}.jpg`,
    filename: `${id}.jpg`,
    mimeType: 'image/jpeg',
    width: 100,
    height: 100,
    fileSize: 1_000,
    sortOrder,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  };
}

function createRepository(attachments: readonly EventAttachment[] = []) {
  const database = createInMemoryDatabase({
    events: DEVELOPMENT_SEED.events,
    attachments,
    categories: DEVELOPMENT_SEED.categories,
    locations: DEVELOPMENT_SEED.locations,
  });

  return {
    database,
    repository: new InMemoryAttachmentRepository(database, dependencies()),
  };
}

function validInput(
  overrides: Partial<CreateAttachmentInput> = {}
): CreateAttachmentInput {
  return {
    eventId: EVENT_ID,
    relativePath: '  attachments/photo.jpg  ',
    filename: '  photo.jpg  ',
    mimeType: ' IMAGE/JPEG ',
    width: 1_200,
    height: 800,
    fileSize: 250_000,
    ...overrides,
  };
}

describe('InMemoryAttachmentRepository', () => {
  it('creates a normalized attachment after the highest active sort order', async () => {
    const existing = [
      attachment('active', 4, '2026-07-30T10:00:00.000Z'),
      attachment('deleted', 20, '2026-07-30T11:00:00.000Z', {
        deletedAt: '2026-07-30T12:00:00.000Z',
      }),
    ];
    const { database, repository } = createRepository(existing);

    const created = await repository.create(validInput());

    expect(created).toEqual({
      id: ATTACHMENT_ID,
      eventId: EVENT_ID,
      relativePath: 'attachments/photo.jpg',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      width: 1_200,
      height: 800,
      fileSize: 250_000,
      sortOrder: 5,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
    expect(database.attachments.get(created.id)).not.toBe(created);
  });

  it('lists active attachments by order, newest creation, then ID', async () => {
    const { repository } = createRepository([
      attachment('older', 0, '2026-07-30T09:00:00.000Z'),
      attachment('newer-b', 0, '2026-07-30T10:00:00.000Z'),
      attachment('newer-a', 0, '2026-07-30T10:00:00.000Z'),
      attachment('second', 1, '2026-07-31T10:00:00.000Z'),
      attachment('deleted', -1, '2026-07-31T12:00:00.000Z', {
        deletedAt: NOW,
      }),
    ]);

    const listed = await repository.listForEvent(EVENT_ID);

    expect(listed.map((item) => item.id)).toEqual([
      'newer-a',
      'newer-b',
      'older',
      'second',
    ]);
  });

  it('reorders from a caller-order snapshot and returns that exact order', async () => {
    const { database, repository } = createRepository([
      attachment('a', 0, '2026-07-30T10:00:00.000Z'),
      attachment('b', 1, '2026-07-30T11:00:00.000Z'),
      attachment('c', 2, '2026-07-30T12:00:00.000Z'),
    ]);
    const requestedOrder = ['c', 'a', 'b'] as const;

    const reordered = await repository.reorder(EVENT_ID, requestedOrder);

    expect(reordered.map((item) => item.id)).toEqual(requestedOrder);
    expect(reordered.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
    expect(requestedOrder).toEqual(['c', 'a', 'b']);
    expect(database.attachments.get('c')?.updatedAt).toBe(NOW);
  });

  it.each([
    ['duplicates', ['a', 'a']],
    ['missing IDs', ['a']],
    ['unknown IDs', ['a', 'missing']],
  ])('rejects reorder %s without partial writes', async (_, ids) => {
    const initial = [
      attachment('a', 0, '2026-07-30T10:00:00.000Z'),
      attachment('b', 1, '2026-07-30T11:00:00.000Z'),
    ];
    const { database, repository } = createRepository(initial);

    await expect(repository.reorder(EVENT_ID, ids)).rejects.toBeInstanceOf(
      ids.includes('missing') ? EntityNotFoundError : ModelValidationError
    );
    expect([...database.attachments.values()]).toEqual(initial);
  });

  it('rejects attachments from another event during reorder', async () => {
    const otherEvent = DEVELOPMENT_SEED.events[1]!;
    const initial = [
      attachment('own', 0, '2026-07-30T10:00:00.000Z'),
      attachment('foreign', 0, '2026-07-30T11:00:00.000Z', {
        eventId: otherEvent.id,
      }),
    ];
    const { database, repository } = createRepository(initial);

    await expect(
      repository.reorder(EVENT_ID, ['own', 'foreign'])
    ).rejects.toBeInstanceOf(ModelValidationError);
    expect([...database.attachments.values()]).toEqual(initial);
  });

  it('soft deletes and restores an attachment at the active carousel end', async () => {
    const initial = [
      attachment('restored', 0, '2026-07-30T10:00:00.000Z'),
      attachment('remaining', 4, '2026-07-30T11:00:00.000Z'),
    ];
    const { database, repository } = createRepository(initial);

    await repository.softDelete('restored');

    await expect(repository.getById('restored')).resolves.toBeNull();
    expect(database.attachments.get('restored')).toMatchObject({
      sortOrder: 0,
      deletedAt: NOW,
      updatedAt: NOW,
    });

    await repository.restore('restored');

    await expect(repository.getById('restored')).resolves.toMatchObject({
      sortOrder: 5,
      deletedAt: null,
      updatedAt: NOW,
    });
  });

  it('throws when the parent event is missing or soft deleted', async () => {
    const { database, repository } = createRepository();

    await expect(
      repository.listForEvent('missing-event')
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    await expect(
      repository.create(validInput({ eventId: 'missing-event' }))
    ).rejects.toBeInstanceOf(EntityNotFoundError);

    const event = database.events.get(EVENT_ID);

    if (!event) throw new Error('Expected seeded event.');

    database.events.set(EVENT_ID, { ...event, deletedAt: NOW });

    await expect(repository.listForEvent(EVENT_ID)).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
    await expect(repository.create(validInput())).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });

  it.each([
    ['empty path', { relativePath: '   ' }],
    ['empty filename', { filename: '   ' }],
    ['invalid width', { width: 0 }],
    ['invalid height', { height: -1 }],
    ['invalid file size', { fileSize: -1 }],
  ])('rejects %s without writing', async (_, override) => {
    const { database, repository } = createRepository();

    await expect(
      repository.create(validInput(override))
    ).rejects.toBeInstanceOf(ModelValidationError);
    expect(database.attachments.size).toBe(0);
  });

  it('rejects generated ID collisions', async () => {
    const existing = attachment(ATTACHMENT_ID, 0, '2026-07-30T10:00:00.000Z');
    const { database } = createRepository([existing]);
    const repository = new InMemoryAttachmentRepository(
      database,
      dependencies(ATTACHMENT_ID)
    );

    await expect(repository.create(validInput())).rejects.toBeInstanceOf(
      RepositoryError
    );
    expect(database.attachments.get(ATTACHMENT_ID)).toEqual(existing);
  });
});
