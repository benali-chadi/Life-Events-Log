import type { Person } from '@/models';
import type { RepositoryDependencies } from '@/data/repositories';
import type { InMemoryDatabase } from '../types';
import { InMemoryNamedMetadataRepository } from './InMemoryNamedMetadataRepository';
import { countActivePersonUsage } from './metadataUsageUtils';
import { softDeleteMetadataRelationships } from './softDeleteMetadataRelationships';

export class InMemoryPersonRepository extends InMemoryNamedMetadataRepository<Person> {
  constructor(
    database: InMemoryDatabase,
    dependencies: RepositoryDependencies
  ) {
    super(database.people, dependencies, {
      entityName: 'Person',
      createEntity: (person) => person,
      getUsageCounts: () => countActivePersonUsage(database),
      softDeleteReferences: (personId, timestamp) =>
        softDeleteMetadataRelationships({
          database,
          metadataId: personId,
          relationships: database.eventPeople,
          getMetadataId: (relationship) => relationship.personId,
          timestamp,
        }),
    });
  }
}
