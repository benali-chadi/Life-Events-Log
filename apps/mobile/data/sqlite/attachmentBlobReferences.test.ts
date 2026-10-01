import { expect, it } from 'vitest';
import { createTestDatabase } from './testing/createTestDatabase';
import { events, eventAttachments } from './schema';
import { createAttachmentBlobReferences } from './attachmentBlobReferences';

it('keeps a shared blob if any attachment and its parent are both active', async () => {
  const { sqlite, database } = await createTestDatabase();
  const at = '2026-09-21T00:00:00.000Z';
  try {
    for (const id of ['active', 'deleted'])
      database
        .insert(events)
        .values({
          id,
          title: id,
          date: '2026-09-21',
          time: null,
          significance: 'ordinary',
          notes: '',
          createdAt: at,
          updatedAt: at,
          deletedAt: id === 'deleted' ? at : null,
        })
        .run();
    const fixtures = [
      ['a', 'active', null, 'a'],
      ['b', 'deleted', null, 'a'],
      ['c', 'active', at, 'a'],
      ['d', 'deleted', null, 'b'],
      ['e', 'active', at, 'c'],
      ['f', 'deleted', at, 'd'],
    ] as const;
    for (const [id, eventId, deletedAt, hash] of fixtures)
      database
        .insert(eventAttachments)
        .values({
          id,
          eventId,
          deletedAt,
          contentHash: hash.repeat(64),
          filename: 'file.jpg',
          sortOrder: 0,
          createdAt: at,
          updatedAt: at,
        })
        .run();
    const references = createAttachmentBlobReferences(database);
    expect(references.liveContentHashes()).toEqual(new Set(['a'.repeat(64)]));
  } finally {
    sqlite.close();
  }
});
