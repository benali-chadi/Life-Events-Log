import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { createDrizzleDatabase, createSQLiteRepositories } from './sqlite';

export function createAppRepositories(sqlite: SQLiteDatabase) {
  return createSQLiteRepositories(createDrizzleDatabase(sqlite), {
    createId: randomUUID,
    now: () => new Date().toISOString(),
  });
}
