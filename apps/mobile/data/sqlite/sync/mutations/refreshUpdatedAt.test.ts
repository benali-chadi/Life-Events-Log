import { expect, it } from 'vitest';
import { createTestDatabase } from '../../testing/createTestDatabase';
import { createOperation } from '../createOperation';
import { applyOperation } from '../applyOperation';
import { refreshUpdatedAt } from './refreshUpdatedAt';
import type { CreateOperationInput } from '../types';

it('skips unchanged timestamps for entities, relations, attachments and reorders', async () => {
  const queries: string[] = [];
  const { sqlite, database } = await createTestDatabase({
    initializeSyncState: true,
    logger: {
      logQuery(query) {
        queries.push(query);
      },
    },
  });
  const at = '2026-09-21T00:00:00.000Z';
  const inputs: CreateOperationInput[] = [
    {
      operationType: 'entity.create',
      entityType: 'tag',
      entityId: 'tag',
      payload: { name: 'Tag', createdAt: at, updatedAt: at },
    },
    {
      operationType: 'entity.create',
      entityType: 'event',
      entityId: 'event',
      payload: {
        title: 'Event',
        date: '2026-09-21',
        time: null,
        significance: 'ordinary',
        notes: '',
        categoryId: null,
        locationId: null,
        createdAt: at,
        updatedAt: at,
      },
    },
    {
      operationType: 'relation.add',
      entityType: 'event_tag',
      entityId: JSON.stringify(['event', 'tag']),
      payload: { eventId: 'event', tagId: 'tag', createdAt: at, updatedAt: at },
    },
    {
      operationType: 'attachment.create',
      entityType: 'attachment',
      entityId: 'image',
      payload: {
        eventId: 'event',
        filename: 'image.jpg',
        contentHash: 'a'.repeat(64),
        mimeType: null,
        width: null,
        height: null,
        fileSize: null,
        sortOrder: 0,
        createdAt: at,
        updatedAt: at,
      },
    },
    {
      operationType: 'event.attachment.reorder',
      entityType: 'event',
      entityId: 'event',
      payload: { orderedAttachmentIds: ['image'], updatedAt: at },
    },
  ];
  try {
    const operations = inputs.map((input) =>
      database.transaction((tx) => {
        const operation = createOperation(input, tx);
        applyOperation(operation, tx);
        return operation;
      })
    );
    queries.length = 0;
    database.transaction((tx) =>
      operations.forEach((operation) => refreshUpdatedAt(operation, tx))
    );
    expect(queries.filter((query) => /^update\b/i.test(query))).toEqual([]);

    // A superseded future timestamp must still be corrected downward.
    sqlite.run("UPDATE tags SET updated_at = '2099-01-01T00:00:00.000Z'");
    queries.length = 0;
    database.transaction((tx) => refreshUpdatedAt(operations[0]!, tx));
    expect(queries.filter((query) => /^update\b/i.test(query))).toHaveLength(1);
    expect(sqlite.exec('SELECT updated_at FROM tags')[0]?.values[0]?.[0]).toBe(
      at
    );
  } finally {
    sqlite.close();
  }
});
