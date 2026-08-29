import type { Location, UUID } from '@/models';
import {
  EntityNotFoundError,
  type RepositoryDependencies,
} from '@/data/repositories';
import type { InMemoryDatabase } from '../types';
import { InMemoryNamedMetadataRepository } from './InMemoryNamedMetadataRepository';
import { countActiveEventFieldUsage } from './metadataUsageUtils';
import { softDeleteEventFieldMetadata } from './softDeleteEventFieldMetadata';

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

  override async softDelete(id: UUID) {
    return this.softDeleteMany([id]);
  }

  override async softDeleteMany(ids: readonly UUID[]) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return { affectedEventIds: [] };

    uniqueIds.forEach((id) => {
      if (!this.database.locations.has(id)) {
        throw new EntityNotFoundError('Location', id);
      }
    });
    const timestamp = this.repositoryDependencies.now();
    const affectedEventIds = new Set<UUID>();
    uniqueIds.forEach((id) => {
      softDeleteEventFieldMetadata({
        database: this.database,
        metadataId: id,
        metadataName: 'Location',
        metadataTable: this.database.locations,
        eventField: 'locationId',
        timestamp,
      }).affectedEventIds.forEach((eventId) => affectedEventIds.add(eventId));
    });
    return { affectedEventIds: [...affectedEventIds].sort() };
  }
}
