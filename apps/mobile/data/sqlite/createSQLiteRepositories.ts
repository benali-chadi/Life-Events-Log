import type { Repositories, RepositoryDependencies } from '@/data/repositories';
import type { AppDatabase } from './database';
import {
  SQLiteAttachmentRepository,
  SQLiteCategoryRepository,
  SQLiteEventRepository,
  SQLiteEventExportRepository,
  SQLiteEventImportRepository,
  SQLiteLocationRepository,
  SQLitePersonRepository,
  SQLiteTagRepository,
} from './repositories';

export function createSQLiteRepositories(
  database: AppDatabase,
  dependencies: RepositoryDependencies
): Repositories {
  const events = new SQLiteEventRepository(database, dependencies);
  return {
    events,
    eventExports: new SQLiteEventExportRepository(database, events),
    eventImports: new SQLiteEventImportRepository(database, dependencies),
    attachments: new SQLiteAttachmentRepository(database, dependencies),
    tags: new SQLiteTagRepository(database, dependencies),
    categories: new SQLiteCategoryRepository(database, dependencies),
    people: new SQLitePersonRepository(database, dependencies),
    locations: new SQLiteLocationRepository(database, dependencies),
  };
}
