import type { Location } from '@/models';
import type { RepositoryDependencies } from '@/data/repositories';
import type { InMemoryDatabase } from '../types';
import { InMemoryNamedMetadataRepository } from './InMemoryNamedMetadataRepository';

export class InMemoryLocationRepository extends InMemoryNamedMetadataRepository<Location> {
  constructor(
    database: InMemoryDatabase,
    dependencies: RepositoryDependencies
  ) {
    super(database.locations, dependencies, {
      entityName: 'Location',
      createEntity: (location) => location,
    });
  }
}
