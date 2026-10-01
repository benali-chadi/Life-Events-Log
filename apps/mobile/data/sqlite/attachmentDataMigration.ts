import { sql } from 'drizzle-orm';
import type { AppDatabase } from './database';

export const ATTACHMENT_CONTENT_HASH_MIGRATION = 'attachment-content-hashes-v1';
export const ATTACHMENT_HASH_FINAL_SCHEMA_INDEX = 5;

export type AttachmentMigrationStorage = {
  migrateFile: (relativePath: string) => Promise<string | null>;
  removeLegacyFile: (relativePath: string) => void;
};

/** Runs between the nullable-column and final NOT NULL schema migrations. */
export async function migrateAttachmentContentHashes(
  database: AppDatabase,
  storage: AttachmentMigrationStorage
): Promise<{ deletedMissingCount: number }> {
  const applied = database.all<{ key: string }>(
    sql`SELECT key FROM app_data_migrations WHERE key = ${ATTACHMENT_CONTENT_HASH_MIGRATION}`
  );
  if (applied.length > 0) return { deletedMissingCount: 0 };

  const rows = database.all<{ id: string; relative_path: string }>(
    sql`SELECT id, relative_path FROM event_attachments`
  );
  const migrated: { id: string; path: string; hash: string | null }[] = [];
  // No SQLite transaction spans file I/O. Originals survive failures/retries.
  for (const row of rows) {
    const hash = await storage.migrateFile(row.relative_path);
    if (hash !== null && !/^[0-9a-f]{64}$/.test(hash))
      throw new Error('Invalid migrated attachment hash.');
    migrated.push({ id: row.id, path: row.relative_path, hash });
  }
  database.transaction((tx) => {
    for (const row of migrated) {
      if (row.hash === null) {
        tx.run(sql`DELETE FROM event_attachments WHERE id = ${row.id}`);
      } else {
        tx.run(
          sql`UPDATE event_attachments SET content_hash = ${row.hash} WHERE id = ${row.id}`
        );
      }
    }
    tx.run(
      sql`INSERT INTO app_data_migrations (key, applied_at) VALUES (${ATTACHMENT_CONTENT_HASH_MIGRATION}, ${new Date().toISOString()})`
    );
  });
  // Cleanup failure leaves an extra old file, never a broken migrated record.
  for (const path of new Set(
    migrated.filter((row) => row.hash !== null).map((row) => row.path)
  )) {
    try {
      storage.removeLegacyFile(path);
    } catch (error) {
      console.warn('Could not remove migrated attachment source.', error);
    }
  }
  return {
    deletedMissingCount: migrated.filter((row) => row.hash === null).length,
  };
}
