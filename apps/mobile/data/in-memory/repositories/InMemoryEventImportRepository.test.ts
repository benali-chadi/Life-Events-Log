import type { RepositoryDependencies } from '@/data/repositories';
import { eventImportRepositoryContract } from '@/data/repositories/eventImportRepositoryContract';
import { createInMemoryRepositories } from '../createInMemoryRepositories';

function dependencies(): RepositoryDependencies {
  let nextId = 0;
  return {
    createId: () => `generated-${++nextId}`,
    now: () => '2026-09-01T12:00:00.000Z',
  };
}

eventImportRepositoryContract('In-memory', async () =>
  createInMemoryRepositories({ dependencies: dependencies() })
);
