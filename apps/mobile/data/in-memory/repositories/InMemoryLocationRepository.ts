import type { Location, UUID } from '@/models';
import type { RepositoryDependencies } from '@/data/repositories';
import type { InMemoryDatabase } from '../types';
import { InMemoryNamedMetadataRepository } from './InMemoryNamedMetadataRepository';
import { countActiveEventFieldUsage } from './metadataUsageUtils';
import { deleteEventFieldMetadata } from './deleteEventFieldMetadata';

export class InMemoryLocationRepository extends InMemoryNamedMetadataRepository<Location> {
  constructor(
    private readonly database: InMemoryDatabase,
    private readonly repositoryDependencies: RepositoryDependencies
  ) {
    super(database.locations, repositoryDependencies, {
      entityName: 'Location',
      createEntity: (location) => location,
      getUsageCounts: () =>
        countActiveEventFieldUsage(database, (event) => event.locationId),
    });
  }

  override async delete(id: UUID) {
    return deleteEventFieldMetadata({
      database: this.database,
      metadataId: id,
      metadataName: 'Location',
      metadataTable: this.database.locations,
      eventField: 'locationId',
      timestamp: this.repositoryDependencies.now(),
    });
  }
}
