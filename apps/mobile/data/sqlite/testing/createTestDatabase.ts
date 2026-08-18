import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/sql-js';
import initSqlJs, { type Database } from 'sql.js';
import type { AppDatabase } from '../database';
import * as schema from '../schema';

function applyMigrations(database: Database) {
  const migrationsDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../drizzle'
  );
  const migrations = readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith('.sql'))
    .sort();

  for (const filename of migrations) {
    const migration = readFileSync(
      `${migrationsDirectory}/${filename}`,
      'utf8'
    );

    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) database.run(statement);
    }
  }
}

export async function createTestDatabase() {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  sqlite.run('PRAGMA foreign_keys = ON');
  applyMigrations(sqlite);

  return {
    sqlite,
    database: drizzle(sqlite, { schema }) as unknown as AppDatabase,
  };
}
