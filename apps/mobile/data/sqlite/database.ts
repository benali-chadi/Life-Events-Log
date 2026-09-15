import { drizzle } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { initializeSyncLocalState } from './sync/initializeSyncLocalState';
import { bootstrapDefaults } from './sync/bootstrapDefaults';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import type { SQLiteDatabase } from 'expo-sqlite';
import migrations from '../../drizzle/migrations';
import { runDataMigrations } from './dataMigrations';
import * as schema from './schema';
import {
  ATTACHMENT_HASH_FINAL_SCHEMA_INDEX,
  migrateAttachmentContentHashes,
} from './attachmentDataMigration';
import {
  migrateLegacyAttachmentFile,
  removeLegacyAttachmentFile,
} from '../attachments/attachmentStorage';

export const DATABASE_NAME = 'life-events-log.db';

export function createDrizzleDatabase(sqlite: SQLiteDatabase) {
  return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof createDrizzleDatabase>;
export type SyncTransaction = Parameters<
  Parameters<AppDatabase['transaction']>[0]
>[0];

export async function initializeDatabase(sqlite: SQLiteDatabase) {
  await sqlite.execAsync('PRAGMA journal_mode = WAL;');
  await sqlite.execAsync('PRAGMA foreign_keys = ON;');
  const database = createDrizzleDatabase(sqlite);
  // Stop before removing legacy paths so asynchronous file conversion can run.
  await migrate(database, {
    ...migrations,
    journal: {
      ...migrations.journal,
      entries: migrations.journal.entries.filter(
        (entry) => entry.idx < ATTACHMENT_HASH_FINAL_SCHEMA_INDEX
      ),
    },
  });
  const result = await migrateAttachmentContentHashes(database, {
    migrateFile: migrateLegacyAttachmentFile,
    removeLegacyFile: removeLegacyAttachmentFile,
  });
  if (result.deletedMissingCount > 0)
    console.warn(
      `Removed ${result.deletedMissingCount} legacy attachment records with missing files.`
    );
  await migrate(database, migrations);
  runDataMigrations(database);
  initializeSyncLocalState(database, randomUUID);
  bootstrapDefaults(database);
}
