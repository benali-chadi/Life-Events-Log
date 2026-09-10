import type { Person } from '@/models';
import type { RepositoryDependencies } from '@/data/repositories';
import type { InMemoryDatabase } from '../types';
import { InMemoryNamedMetadataRepository } from './InMemoryNamedMetadataRepository';
import { countActivePersonUsage } from './metadataUsageUtils';

export class InMemoryPersonRepository extends InMemoryNamedMetadataRepository<Person> {
  constructor(
    database: InMemoryDatabase,
    dependencies: RepositoryDependencies
  ) {
    super(database.people, dependencies, {
      entityName: 'Person',
      createEntity: (person) => person,
      getUsageCounts: () => countActivePersonUsage(database),
      getAffectedEventIds: (personId) =>
        [...database.eventPeople.values()]
          .filter(
            (relation) =>
              relation.personId === personId &&
              relation.deletedAt === null &&
              database.events.has(relation.eventId)
          )
          .map((relation) => relation.eventId),
    });
  }
}
