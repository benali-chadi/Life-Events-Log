import type { Location } from '@/models';
import type { RepositoryDependencies } from '@/data/repositories';
import type { InMemoryDatabase } from '../types';
import { InMemoryNamedMetadataRepository } from './InMemoryNamedMetadataRepository';
import { countActiveEventFieldUsage } from './metadataUsageUtils';

export class InMemoryLocationRepository extends InMemoryNamedMetadataRepository<Location> {
  constructor(
    database: InMemoryDatabase,
    dependencies: RepositoryDependencies
  ) {
    super(database.locations, dependencies, {
      entityName: 'Location',
      createEntity: (location) => location,
      getUsageCounts: () =>
        countActiveEventFieldUsage(database, (event) => event.locationId),
    });
  }
}
