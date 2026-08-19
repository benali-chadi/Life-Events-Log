import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import {
  DuplicateNameError,
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type CreateNamedMetadataInput,
  type MetadataListQuery,
  type MetadataUsageItem,
  type PersonRepository,
  type RepositoryDependencies,
  type SoftDeleteMetadataResult,
  type UpdateNamedMetadataInput,
} from '@/data/repositories';
import {
  comparableMetadataName,
  compareMetadataNames,
  normalizeMetadataName,
} from '@/data/repositories/metadataName';
import type { Person, UUID } from '@/models';
import type { AppDatabase } from '../database';
import { eventPeople, events, people } from '../schema';

export class SQLitePersonRepository implements PersonRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID): Promise<Person | null> {
    return (
      this.database
        .select()
        .from(people)
        .where(and(eq(people.id, id), isNull(people.deletedAt)))
        .get() ?? null
    );
  }

  async list(query?: MetadataListQuery): Promise<Person[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select()
      .from(people)
      .where(isNull(people.deletedAt))
      .all()
      .filter(
        (person) =>
          !search || comparableMetadataName(person.name).includes(search)
      )
      .sort(compareMetadataNames);
  }

  async listWithUsage(
    query?: MetadataListQuery
  ): Promise<MetadataUsageItem<Person>[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select({ metadata: people, eventCount: count(events.id) })
      .from(people)
      .leftJoin(
        eventPeople,
        and(eq(eventPeople.personId, people.id), isNull(eventPeople.deletedAt))
      )
      .leftJoin(
        events,
        and(eq(events.id, eventPeople.eventId), isNull(events.deletedAt))
      )
      .where(isNull(people.deletedAt))
      .groupBy(people.id)
      .all()
      .filter(
        ({ metadata }) =>
          !search || comparableMetadataName(metadata.name).includes(search)
      )
      .sort(
        (left, right) =>
          right.eventCount - left.eventCount ||
          compareMetadataNames(left.metadata, right.metadata)
      );
  }

  async create(input: CreateNamedMetadataInput): Promise<Person> {
    const name = this.validName(input.name);
    this.assertUniqueName(name);

    const id = this.dependencies.createId();
    const existing = this.database
      .select({ id: people.id })
      .from(people)
      .where(eq(people.id, id))
      .get();

    if (existing) {
      throw new RepositoryError(
        `Generated duplicate person ID “${id}”. No person was created.`
      );
    }

    const timestamp = this.dependencies.now();
    const person: Person = {
      id,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    this.database.insert(people).values(person).run();

    return person;
  }

  async update(id: UUID, input: UpdateNamedMetadataInput): Promise<Person> {
    const existing = this.activePersonOrThrow(id);
    const name = this.validName(input.name);
    this.assertUniqueName(name, id);

    const updated: Person = {
      ...existing,
      name,
      updatedAt: this.dependencies.now(),
    };

    this.database
      .update(people)
      .set({ name: updated.name, updatedAt: updated.updatedAt })
      .where(eq(people.id, id))
      .run();

    return updated;
  }

  async softDelete(id: UUID): Promise<SoftDeleteMetadataResult> {
    return this.database.transaction((transaction) => {
      const person = transaction
        .select()
        .from(people)
        .where(eq(people.id, id))
        .get();

      if (!person) throw new EntityNotFoundError('Person', id);
      if (person.deletedAt !== null) return { affectedEventIds: [] };

      const affectedEventIds = transaction
        .select({ id: eventPeople.eventId })
        .from(eventPeople)
        .where(and(eq(eventPeople.personId, id), isNull(eventPeople.deletedAt)))
        .all()
        .map((event) => event.id)
        .sort();
      const timestamp = this.dependencies.now();

      transaction
        .update(people)
        .set({ updatedAt: timestamp, deletedAt: timestamp })
        .where(and(eq(people.id, id), isNull(people.deletedAt)))
        .run();
      transaction
        .update(eventPeople)
        .set({ updatedAt: timestamp, deletedAt: timestamp })
        .where(and(eq(eventPeople.personId, id), isNull(eventPeople.deletedAt)))
        .run();
      if (affectedEventIds.length > 0) {
        transaction
          .update(events)
          .set({ updatedAt: timestamp })
          .where(inArray(events.id, affectedEventIds))
          .run();
      }

      return { affectedEventIds };
    });
  }

  private validName(value: string) {
    const name = normalizeMetadataName(value);

    if (!name) throw new ModelValidationError('Person name cannot be empty.');

    return name;
  }

  private assertUniqueName(name: string, excludedId?: UUID) {
    const comparison = comparableMetadataName(name);
    const duplicate = this.database
      .select({ id: people.id, name: people.name })
      .from(people)
      .where(isNull(people.deletedAt))
      .all()
      .some(
        (person) =>
          person.id !== excludedId &&
          comparableMetadataName(person.name) === comparison
      );

    if (duplicate) throw new DuplicateNameError('Person', name);
  }

  private activePersonOrThrow(id: UUID) {
    const person = this.database
      .select()
      .from(people)
      .where(and(eq(people.id, id), isNull(people.deletedAt)))
      .get();

    if (!person) throw new EntityNotFoundError('Person', id);

    return person;
  }
}
