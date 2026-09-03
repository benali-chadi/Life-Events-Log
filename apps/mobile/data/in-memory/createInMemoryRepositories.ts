import type { Repositories, RepositoryDependencies } from '@/data/repositories';
import { createInMemoryDatabase } from './createInMemoryDatabase';
import {
  InMemoryAttachmentRepository,
  InMemoryCategoryRepository,
  InMemoryEventRepository,
  InMemoryEventExportRepository,
  InMemoryEventImportRepository,
  InMemoryLocationRepository,
  InMemoryPersonRepository,
  InMemoryTagRepository,
} from './repositories';
import type { InMemorySeed } from './types';

export type CreateInMemoryRepositoriesOptions = {
  seed?: InMemorySeed;
  dependencies: RepositoryDependencies;
};

export function createInMemoryRepositories({
  seed,
  dependencies,
}: CreateInMemoryRepositoriesOptions): Repositories {
  const database = createInMemoryDatabase(seed);
  const events = new InMemoryEventRepository(database, dependencies);

  return {
    events,
    eventExports: new InMemoryEventExportRepository(events),
    eventImports: new InMemoryEventImportRepository(database, dependencies),
    attachments: new InMemoryAttachmentRepository(database, dependencies),
    tags: new InMemoryTagRepository(database, dependencies),
    categories: new InMemoryCategoryRepository(database, dependencies),
    people: new InMemoryPersonRepository(database, dependencies),
    locations: new InMemoryLocationRepository(database, dependencies),
  };
}
