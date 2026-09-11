import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Database } from 'sql.js';
import { sql } from 'drizzle-orm';
import type { AppDatabase } from './database';
import { migrateAttachmentContentHashes } from './attachmentDataMigration';
import { createTestDatabase } from './testing/createTestDatabase';

let sqlite: Database;
let database: AppDatabase;
const hash = 'a'.repeat(64);
beforeEach(async () => {
  ({ sqlite, database } = await createTestDatabase({ throughMigration: 4 }));
  sqlite.run(
    "INSERT INTO events (id,title,date,significance,notes,created_at,updated_at) VALUES ('event','Title','2026-09-11','ordinary','','before','before')"
  );
  for (const id of ['one', 'two', 'missing'])
    sqlite.run(
      "INSERT INTO event_attachments (id,event_id,relative_path,filename,sort_order,created_at,updated_at) VALUES (?, 'event', ?, 'photo.jpg', 0, 'before', 'before')",
      [id, `attachments/${id}.jpg`]
    );
});
afterEach(() => sqlite.close());

it('preserves shared content records, removes missing records, and finalizes the schema', async () => {
  const storage = {
    migrateFile: vi.fn(async (path: string) =>
      path.includes('missing') ? null : hash
    ),
    removeLegacyFile: vi.fn(),
  };
  expect(await migrateAttachmentContentHashes(database, storage)).toEqual({
    deletedMissingCount: 1,
  });
  const final = readFileSync(
    new URL('../../drizzle/0005_natural_omega_sentinel.sql', import.meta.url),
    'utf8'
  );
  for (const statement of final.split('--> statement-breakpoint'))
    if (statement.trim()) sqlite.run(statement);
  expect(
    database.all(
      sql`SELECT id, content_hash, updated_at FROM event_attachments ORDER BY id`
    )
  ).toEqual([
    { id: 'one', content_hash: hash, updated_at: 'before' },
    { id: 'two', content_hash: hash, updated_at: 'before' },
  ]);
  expect(
    database
      .all<{ name: string }>(sql`PRAGMA table_info(event_attachments)`)
      .map((row) => row.name)
  ).not.toContain('relative_path');
  expect(() =>
    sqlite.run('UPDATE event_attachments SET content_hash = NULL')
  ).toThrow();
  expect(() =>
    sqlite.run("UPDATE event_attachments SET content_hash = 'invalid'")
  ).toThrow();
  await migrateAttachmentContentHashes(database, storage);
  expect(storage.migrateFile).toHaveBeenCalledTimes(3);
  expect(storage.removeLegacyFile).toHaveBeenCalledTimes(2);
});

it('leaves rows and sources intact on I/O failure and can retry', async () => {
  const storage = {
    migrateFile: vi
      .fn(async () => hash)
      .mockRejectedValueOnce(new Error('read failed')),
    removeLegacyFile: vi.fn(),
  };
  await expect(
    migrateAttachmentContentHashes(database, storage)
  ).rejects.toThrow('read failed');
  expect(database.all(sql`SELECT id FROM event_attachments`)).toHaveLength(3);
  expect(database.all(sql`SELECT content_hash FROM event_attachments`)).toEqual(
    [{ content_hash: null }, { content_hash: null }, { content_hash: null }]
  );
  expect(storage.removeLegacyFile).not.toHaveBeenCalled();
  await migrateAttachmentContentHashes(database, storage);
  expect(
    database.all(
      sql`SELECT id FROM event_attachments WHERE content_hash IS NULL`
    )
  ).toEqual([]);
});

it('rolls back conversion and missing-row deletion when the database write fails', async () => {
  sqlite.run(
    "CREATE TRIGGER fail_migration BEFORE INSERT ON app_data_migrations BEGIN SELECT RAISE(ABORT, 'failure'); END"
  );
  const storage = {
    migrateFile: async (path: string) =>
      path.includes('missing') ? null : hash,
    removeLegacyFile: vi.fn(),
  };
  await expect(
    migrateAttachmentContentHashes(database, storage)
  ).rejects.toThrow();
  expect(database.all(sql`SELECT id FROM event_attachments`)).toHaveLength(3);
  expect(
    database.all(
      sql`SELECT id FROM event_attachments WHERE content_hash IS NOT NULL`
    )
  ).toEqual([]);
  expect(storage.removeLegacyFile).not.toHaveBeenCalled();
});
