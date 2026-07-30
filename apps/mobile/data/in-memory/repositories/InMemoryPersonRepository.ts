import type { Person } from '@/models';
import type { RepositoryDependencies } from '@/data/repositories';
import type { InMemoryDatabase } from '../types';
import { InMemoryNamedMetadataRepository } from './InMemoryNamedMetadataRepository';

export class InMemoryPersonRepository extends InMemoryNamedMetadataRepository<Person> {
  constructor(
    database: InMemoryDatabase,
    dependencies: RepositoryDependencies
  ) {
    super(database.people, dependencies, {
      entityName: 'Person',
      createEntity: (person) => person,
    });
  }
}
