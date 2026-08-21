import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  sql,
} from 'drizzle-orm';
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
  normalizeMetadataName,
} from '@/data/repositories/metadataName';
import type { Person, UUID } from '@/models';
import type { AppDatabase } from '../database';
import { eventPeople, events, people, personModelColumns } from '../schema';

export class SQLitePersonRepository implements PersonRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID): Promise<Person | null> {
    return (
      this.database
        .select(personModelColumns)
        .from(people)
        .where(and(eq(people.id, id), isNull(people.deletedAt)))
        .get() ?? null
    );
  }

  async list(query?: MetadataListQuery): Promise<Person[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select(personModelColumns)
      .from(people)
      .where(
        and(
          isNull(people.deletedAt),
          search
            ? sql`instr(${people.normalizedName}, ${search}) > 0`
            : undefined
        )
      )
      .orderBy(asc(people.normalizedName), asc(people.id))
      .all();
  }

  async listWithUsage(
    query?: MetadataListQuery
  ): Promise<MetadataUsageItem<Person>[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select({ metadata: personModelColumns, eventCount: count(events.id) })
      .from(people)
      .leftJoin(
        eventPeople,
        and(eq(eventPeople.personId, people.id), isNull(eventPeople.deletedAt))
      )
      .leftJoin(
        events,
        and(eq(events.id, eventPeople.eventId), isNull(events.deletedAt))
      )
      .where(
        and(
          isNull(people.deletedAt),
          search
            ? sql`instr(${people.normalizedName}, ${search}) > 0`
            : undefined
        )
      )
      .groupBy(people.id)
      .orderBy(
        desc(count(events.id)),
        asc(people.normalizedName),
        asc(people.id)
      )
      .all();
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

    this.database
      .insert(people)
      .values({
        ...person,
        normalizedName: comparableMetadataName(person.name),
      })
      .run();

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
      .set({
        name: updated.name,
        normalizedName: comparableMetadataName(updated.name),
        updatedAt: updated.updatedAt,
      })
      .where(eq(people.id, id))
      .run();

    return updated;
  }

  async softDelete(id: UUID): Promise<SoftDeleteMetadataResult> {
    return this.database.transaction((transaction) => {
      const person = transaction
        .select(personModelColumns)
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
    const duplicate = this.database
      .select({ id: people.id })
      .from(people)
      .where(
        and(
          isNull(people.deletedAt),
          eq(people.normalizedName, comparableMetadataName(name)),
          excludedId ? ne(people.id, excludedId) : undefined
        )
      )
      .get();

    if (duplicate) throw new DuplicateNameError('Person', name);
  }

  private activePersonOrThrow(id: UUID) {
    const person = this.database
      .select(personModelColumns)
      .from(people)
      .where(and(eq(people.id, id), isNull(people.deletedAt)))
      .get();

    if (!person) throw new EntityNotFoundError('Person', id);

    return person;
  }
}
