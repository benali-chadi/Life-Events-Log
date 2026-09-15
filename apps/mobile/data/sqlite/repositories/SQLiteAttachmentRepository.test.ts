import type { Database } from 'sql.js';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type CreateAttachmentInput,
  type RepositoryDependencies,
} from '@/data/repositories';
import type { EventAttachment } from '@/models';
import type { AppDatabase } from '../database';
import { eventAttachments, events } from '../schema';
import { createTestDatabase } from '../testing/createTestDatabase';
import { SQLiteAttachmentRepository } from './SQLiteAttachmentRepository';

const NOW = '2026-08-18T10:00:00.000Z';
const EVENT_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_EVENT_ID = '10000000-0000-4000-8000-000000000002';
const ATTACHMENT_ID = '90000000-0000-4000-8000-000000000001';
const dependencies: RepositoryDependencies = {
  createId: () => ATTACHMENT_ID,
  now: () => NOW,
};

function insertEvent(
  database: AppDatabase,
  id: string,
  deletedAt: string | null = null
) {
  database
    .insert(events)
    .values({
      id,
      title: id,
      normalizedTitle: id.toLowerCase(),
      date: '2026-08-18',
      time: null,
      significance: 'ordinary',
      categoryId: null,
      locationId: null,
      notes: '',
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
      deletedAt,
    })
    .run();
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
    contentHash: 'a'.repeat(64),
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

function validInput(
  overrides: Partial<CreateAttachmentInput> = {}
): CreateAttachmentInput {
  return {
    eventId: EVENT_ID,
    contentHash: '  ' + 'a'.repeat(64) + '  ',
    filename: '  photo.jpg  ',
    mimeType: ' IMAGE/JPEG ',
    width: 1_200,
    height: 800,
    fileSize: 250_000,
    ...overrides,
  };
}

describe('SQLiteAttachmentRepository', () => {
  let sqlite: Database;
  let database: AppDatabase;
  let repository: SQLiteAttachmentRepository;

  beforeEach(async () => {
    ({ sqlite, database } = await createTestDatabase({
      initializeSyncState: true,
    }));
    insertEvent(database, EVENT_ID);
    insertEvent(database, OTHER_EVENT_ID);
    repository = new SQLiteAttachmentRepository(database, dependencies);
  });

  afterEach(() => sqlite.close());

  it('creates normalized metadata after the highest active sort order', async () => {
    database
      .insert(eventAttachments)
      .values([
        attachment('active', 4, '2026-08-01T10:00:00.000Z'),
        attachment('deleted', 20, '2026-08-02T10:00:00.000Z', {
          deletedAt: '2026-08-03T10:00:00.000Z',
        }),
      ])
      .run();

    await expect(repository.create(validInput())).resolves.toEqual({
      id: ATTACHMENT_ID,
      eventId: EVENT_ID,
      contentHash: 'a'.repeat(64),
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
  });

  it('lists active attachments in stable carousel order', async () => {
    database
      .insert(eventAttachments)
      .values([
        attachment('older', 0, '2026-08-01T09:00:00.000Z'),
        attachment('newer-b', 0, '2026-08-01T10:00:00.000Z'),
        attachment('newer-a', 0, '2026-08-01T10:00:00.000Z'),
        attachment('second', 1, '2026-08-02T10:00:00.000Z'),
        attachment('deleted', 0, '2026-08-03T10:00:00.000Z', {
          deletedAt: NOW,
        }),
      ])
      .run();

    const listed = await repository.listForEvent(EVENT_ID);
    expect(listed.map(({ id }) => id)).toEqual([
      'newer-a',
      'newer-b',
      'older',
      'second',
    ]);
  });

  it('atomically reorders every active attachment', async () => {
    database
      .insert(eventAttachments)
      .values([
        attachment('a', 0, '2026-08-01T10:00:00.000Z'),
        attachment('b', 1, '2026-08-01T11:00:00.000Z'),
        attachment('c', 2, '2026-08-01T12:00:00.000Z'),
      ])
      .run();

    const reordered = await repository.reorder(EVENT_ID, ['c', 'a', 'b']);
    expect(reordered.map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
      ['c', 0],
      ['a', 1],
      ['b', 2],
    ]);
    expect(reordered.every(({ updatedAt }) => updatedAt === NOW)).toBe(true);
  });

  it.each([
    ['duplicate IDs', ['a', 'a'], ModelValidationError],
    ['missing IDs', ['a'], ModelValidationError],
    ['unknown IDs', ['a', 'missing'], EntityNotFoundError],
  ])(
    'rejects reorder with %s without partial writes',
    async (_, ids, ErrorType) => {
      const initial = [
        attachment('a', 0, '2026-08-01T10:00:00.000Z'),
        attachment('b', 1, '2026-08-01T11:00:00.000Z'),
      ];
      database.insert(eventAttachments).values(initial).run();

      await expect(repository.reorder(EVENT_ID, ids)).rejects.toBeInstanceOf(
        ErrorType
      );
      expect(database.select().from(eventAttachments).all()).toEqual(initial);
    }
  );

  it('rejects an attachment owned by another event during reorder', async () => {
    const initial = [
      attachment('own', 0, '2026-08-01T10:00:00.000Z'),
      attachment('foreign', 0, '2026-08-01T11:00:00.000Z', {
        eventId: OTHER_EVENT_ID,
      }),
    ];
    database.insert(eventAttachments).values(initial).run();

    await expect(
      repository.reorder(EVENT_ID, ['own', 'foreign'])
    ).rejects.toBeInstanceOf(ModelValidationError);
    expect(database.select().from(eventAttachments).all()).toEqual(initial);
  });

  it('soft deletes and restores at the active carousel end', async () => {
    database
      .insert(eventAttachments)
      .values([
        attachment('restored', 0, '2026-08-01T10:00:00.000Z'),
        attachment('remaining', 4, '2026-08-01T11:00:00.000Z'),
      ])
      .run();

    await repository.softDelete('restored');
    await expect(repository.getById('restored')).resolves.toBeNull();

    await repository.restore('restored');
    await expect(repository.getById('restored')).resolves.toMatchObject({
      sortOrder: 5,
      updatedAt: NOW,
      deletedAt: null,
    });
  });

  it('requires an active parent event', async () => {
    await expect(
      repository.listForEvent('missing-event')
    ).rejects.toBeInstanceOf(EntityNotFoundError);
    database
      .update(events)
      .set({ deletedAt: NOW })
      .where(eq(events.id, EVENT_ID))
      .run();
    await expect(repository.create(validInput())).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });

  it.each([
    ['empty path', { contentHash: '   ' }],
    ['empty filename', { filename: '   ' }],
    ['invalid width', { width: 0 }],
    ['invalid height', { height: -1 }],
    ['invalid file size', { fileSize: -1 }],
  ])('rejects %s without writing', async (_, override) => {
    await expect(
      repository.create(validInput(override))
    ).rejects.toBeInstanceOf(ModelValidationError);
    expect(database.select().from(eventAttachments).all()).toEqual([]);
  });

  it('rejects generated ID collisions', async () => {
    const existing = attachment(ATTACHMENT_ID, 0, '2026-08-01T10:00:00.000Z');
    database.insert(eventAttachments).values(existing).run();

    await expect(repository.create(validInput())).rejects.toBeInstanceOf(
      RepositoryError
    );
    expect(database.select().from(eventAttachments).all()).toEqual([existing]);
  });
});
