import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import type { SQLiteDatabase } from 'expo-sqlite';
import migrations from '../../drizzle/migrations';
import { runDataMigrations } from './dataMigrations';
import * as schema from './schema';

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
  await migrate(database, migrations);
  runDataMigrations(database);
}
