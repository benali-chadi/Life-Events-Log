import type { Repositories, RepositoryDependencies } from '@/data/repositories';
import type { AppDatabase } from './database';
import {
  SQLiteAttachmentRepository,
  SQLiteCategoryRepository,
  SQLiteEventRepository,
  SQLiteEventImportRepository,
  SQLiteLocationRepository,
  SQLitePersonRepository,
  SQLiteTagRepository,
} from './repositories';

export function createSQLiteRepositories(
  database: AppDatabase,
  dependencies: RepositoryDependencies
): Repositories {
  return {
    events: new SQLiteEventRepository(database, dependencies),
    eventImports: new SQLiteEventImportRepository(database, dependencies),
    attachments: new SQLiteAttachmentRepository(database, dependencies),
    tags: new SQLiteTagRepository(database, dependencies),
    categories: new SQLiteCategoryRepository(database, dependencies),
    people: new SQLitePersonRepository(database, dependencies),
    locations: new SQLiteLocationRepository(database, dependencies),
  };
}
