import type { Tag } from '@/models';
import type { RepositoryDependencies } from '@/data/repositories';
import type { InMemoryDatabase } from '../types';
import { InMemoryNamedMetadataRepository } from './InMemoryNamedMetadataRepository';
import { countActiveTagUsage } from './metadataUsageUtils';
import { deleteMetadataRelationships } from './deleteMetadataRelationships';

export class InMemoryTagRepository extends InMemoryNamedMetadataRepository<Tag> {
  constructor(
    database: InMemoryDatabase,
    dependencies: RepositoryDependencies
  ) {
    super(database.tags, dependencies, {
      entityName: 'Tag',
      createEntity: (tag) => tag,
      getUsageCounts: () => countActiveTagUsage(database),
      deleteReferences: (tagId, timestamp) =>
        deleteMetadataRelationships({
          database,
          metadataId: tagId,
          relationships: database.eventTags,
          getMetadataId: (relationship) => relationship.tagId,
          timestamp,
        }),
    });
  }
}
