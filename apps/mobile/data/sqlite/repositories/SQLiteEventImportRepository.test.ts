import type { RepositoryDependencies } from '@/data/repositories';
import { eventImportRepositoryContract } from '@/data/repositories/eventImportRepositoryContract';
import { createSQLiteRepositories } from '../createSQLiteRepositories';
import { createTestDatabase } from '../testing/createTestDatabase';

function dependencies(): RepositoryDependencies {
  let nextId = 0;
  return {
    createId: () => `generated-${++nextId}`,
    now: () => '2026-09-01T12:00:00.000Z',
  };
}

eventImportRepositoryContract('SQLite', async () => {
  const { database } = await createTestDatabase({ initializeSyncState: true });
  return createSQLiteRepositories(database, dependencies());
});
