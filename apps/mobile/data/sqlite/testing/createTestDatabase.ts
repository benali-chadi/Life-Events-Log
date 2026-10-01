import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/sql-js';
import type { Logger } from 'drizzle-orm';
import initSqlJs, { type Database } from 'sql.js';
import type { AppDatabase } from '../database';
import { runDataMigrations } from '../dataMigrations';
import { initializeSyncLocalState } from '../sync/initialization/initializeSyncLocalState';
import * as schema from '../schema';

function applyMigrations(
  database: Database,
  includeSeedData: boolean,
  throughMigration?: number
) {
  const migrationsDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../drizzle'
  );
  const migrations = readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith('.sql'))
    .filter(
      (filename) =>
        throughMigration === undefined ||
        Number(filename.slice(0, 4)) <= throughMigration
    )
    .filter(
      (filename) => includeSeedData || !filename.endsWith('_seed_defaults.sql')
    )
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

export async function createTestDatabase(options?: {
  includeSeedData?: boolean;
  initializeSyncState?: boolean;
  runDataMigrations?: boolean;
  logger?: Logger;
  throughMigration?: number;
}) {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  sqlite.run('PRAGMA foreign_keys = ON');
  applyMigrations(
    sqlite,
    options?.includeSeedData ?? false,
    options?.throughMigration
  );

  const database = drizzle(sqlite, {
    schema,
    logger: options?.logger,
  }) as unknown as AppDatabase;
  if (options?.runDataMigrations ?? true) runDataMigrations(database);
  if (options?.initializeSyncState)
    initializeSyncLocalState(database, () => 'test-device');

  return {
    sqlite,
    database,
  };
}
