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
import type { AppDatabase, SyncTransaction } from '../database';
import { applyPendingOperation } from '../sync/pending/applyPendingOperation';
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
            ? sql`(instr(${people.normalizedName}, ${search}) > 0 OR instr(lower(${personModelColumns.displayName}), ${search}) > 0)`
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
            ? sql`(instr(${people.normalizedName}, ${search}) > 0 OR instr(lower(${personModelColumns.displayName}), ${search}) > 0)`
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

    this.database.transaction((tx) => {
      this.assertUniqueName(name, undefined, tx);
      const { id: entityId, deletedAt: _deletedAt, ...payload } = person;
      applyPendingOperation(
        {
          operationType: 'entity.create',
          entityType: 'person',
          entityId,
          payload,
        },
        tx
      );
    });

    return (await this.getById(id))!;
  }

  async update(id: UUID, input: UpdateNamedMetadataInput): Promise<Person> {
    const existing = this.activePersonOrThrow(id);
    const name = this.validName(input.name);

    const updated: Person = {
      ...existing,
      name,
      updatedAt: this.dependencies.now(),
    };

    this.database.transaction((tx) => {
      if (
        comparableMetadataName(name) !== comparableMetadataName(existing.name)
      )
        this.assertUniqueName(name, id, tx);
      applyPendingOperation(
        {
          operationType: 'entity.patch',
          entityType: 'person',
          entityId: id,
          payload: {
            changes: { name: updated.name },
            updatedAt: updated.updatedAt,
          },
        },
        tx
      );
    });

    return (await this.getById(id))!;
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

      applyPendingOperation(
        {
          operationType: 'entity.delete',
          entityType: 'person',
          entityId: id,
          payload: { deletedAt: timestamp },
        },
        transaction
      );

      return { affectedEventIds };
    });
  }

  async softDeleteMany(
    ids: readonly UUID[]
  ): Promise<SoftDeleteMetadataResult> {
    const uniqueIds = [...new Set(ids)];
    const existingIds = new Set(
      uniqueIds.length === 0
        ? []
        : this.database
            .select({ id: people.id })
            .from(people)
            .where(inArray(people.id, uniqueIds))
            .all()
            .map((person) => person.id)
    );
    uniqueIds.forEach((id) => {
      if (!existingIds.has(id)) throw new EntityNotFoundError('Person', id);
    });

    const affectedEventIds = new Set<UUID>();
    for (const id of uniqueIds) {
      const result = await this.softDelete(id);
      result.affectedEventIds.forEach((eventId) =>
        affectedEventIds.add(eventId)
      );
    }
    return { affectedEventIds: [...affectedEventIds].sort() };
  }

  private validName(value: string) {
    const name = normalizeMetadataName(value);

    if (!name) throw new ModelValidationError('Person name cannot be empty.');

    return name;
  }

  private assertUniqueName(
    name: string,
    excludedId: UUID | undefined,
    tx: SyncTransaction
  ) {
    const duplicate = tx
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
