import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import type { SQLiteDatabase } from 'expo-sqlite';
import migrations from '../../drizzle/migrations';
import * as schema from './schema';

export const DATABASE_NAME = 'life-events-log.db';

export function createDrizzleDatabase(sqlite: SQLiteDatabase) {
  return drizzle(sqlite, { schema });
}

export type AppDatabase = ReturnType<typeof createDrizzleDatabase>;

export async function initializeDatabase(sqlite: SQLiteDatabase) {
  await sqlite.execAsync('PRAGMA journal_mode = WAL;');
  await sqlite.execAsync('PRAGMA foreign_keys = ON;');
  await migrate(createDrizzleDatabase(sqlite), migrations);
}
