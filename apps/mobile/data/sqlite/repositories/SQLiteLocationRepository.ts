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
  type LocationRepository,
  type MetadataListQuery,
  type MetadataUsageItem,
  type RepositoryDependencies,
  type SoftDeleteMetadataResult,
  type UpdateNamedMetadataInput,
} from '@/data/repositories';
import {
  comparableMetadataName,
  normalizeMetadataName,
} from '@/data/repositories/metadataName';
import type { Location, UUID } from '@/models';
import type { AppDatabase } from '../database';
import { createOperation } from '../sync/createOperation';
import { applyOperation } from '../sync/applyOperation';
import { events, locationModelColumns, locations } from '../schema';

export class SQLiteLocationRepository implements LocationRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID): Promise<Location | null> {
    return (
      this.database
        .select(locationModelColumns)
        .from(locations)
        .where(and(eq(locations.id, id), isNull(locations.deletedAt)))
        .get() ?? null
    );
  }

  async list(query?: MetadataListQuery): Promise<Location[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select(locationModelColumns)
      .from(locations)
      .where(
        and(
          isNull(locations.deletedAt),
          search
            ? sql`instr(${locations.normalizedName}, ${search}) > 0`
            : undefined
        )
      )
      .orderBy(asc(locations.normalizedName), asc(locations.id))
      .all();
  }

  async listWithUsage(
    query?: MetadataListQuery
  ): Promise<MetadataUsageItem<Location>[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select({
        metadata: locationModelColumns,
        eventCount: count(events.id),
      })
      .from(locations)
      .leftJoin(
        events,
        and(eq(events.locationId, locations.id), isNull(events.deletedAt))
      )
      .where(
        and(
          isNull(locations.deletedAt),
          search
            ? sql`instr(${locations.normalizedName}, ${search}) > 0`
            : undefined
        )
      )
      .groupBy(locations.id)
      .orderBy(
        desc(count(events.id)),
        asc(locations.normalizedName),
        asc(locations.id)
      )
      .all();
  }

  async create(input: CreateNamedMetadataInput): Promise<Location> {
    const name = this.validName(input.name);
    this.assertUniqueName(name);

    const id = this.dependencies.createId();
    const existing = this.database
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, id))
      .get();

    if (existing) {
      throw new RepositoryError(
        `Generated duplicate location ID “${id}”. No location was created.`
      );
    }

    const timestamp = this.dependencies.now();
    const location: Location = {
      id,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    this.database.transaction((tx) => {
      const { id: entityId, deletedAt: _deletedAt, ...payload } = location;
      applyOperation(
        createOperation(
          {
            operationType: 'entity.create',
            entityType: 'location',
            entityId,
            payload,
          },
          tx
        ),
        tx,
        this.dependencies
      );
    });

    return location;
  }

  async update(id: UUID, input: UpdateNamedMetadataInput): Promise<Location> {
    const existing = this.activeLocationOrThrow(id);
    const name = this.validName(input.name);
    this.assertUniqueName(name, id);

    const updated: Location = {
      ...existing,
      name,
      updatedAt: this.dependencies.now(),
    };

    this.database.transaction((tx) => {
      applyOperation(
        createOperation(
          {
            operationType: 'entity.patch',
            entityType: 'location',
            entityId: id,
            payload: {
              changes: { name: updated.name },
              updatedAt: updated.updatedAt,
            },
          },
          tx
        ),
        tx,
        this.dependencies
      );
    });

    return (await this.getById(id))!;
  }

  async softDelete(id: UUID): Promise<SoftDeleteMetadataResult> {
    return this.database.transaction((transaction) => {
      const location = transaction
        .select(locationModelColumns)
        .from(locations)
        .where(eq(locations.id, id))
        .get();

      if (!location) throw new EntityNotFoundError('Location', id);
      if (location.deletedAt !== null) return { affectedEventIds: [] };

      const affectedEventIds = transaction
        .select({ id: events.id })
        .from(events)
        .where(eq(events.locationId, id))
        .all()
        .map((event) => event.id)
        .sort();
      const timestamp = this.dependencies.now();

      applyOperation(
        createOperation(
          {
            operationType: 'entity.delete',
            entityType: 'location',
            entityId: id,
            payload: { deletedAt: timestamp },
          },
          transaction
        ),
        transaction,
        this.dependencies
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
            .select({ id: locations.id })
            .from(locations)
            .where(inArray(locations.id, uniqueIds))
            .all()
            .map((location) => location.id)
    );
    uniqueIds.forEach((id) => {
      if (!existingIds.has(id)) throw new EntityNotFoundError('Location', id);
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

    if (!name) throw new ModelValidationError('Location name cannot be empty.');

    return name;
  }

  private assertUniqueName(name: string, excludedId?: UUID) {
    const duplicate = this.database
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          isNull(locations.deletedAt),
          eq(locations.normalizedName, comparableMetadataName(name)),
          excludedId ? ne(locations.id, excludedId) : undefined
        )
      )
      .get();

    if (duplicate) throw new DuplicateNameError('Location', name);
  }

  private activeLocationOrThrow(id: UUID) {
    const location = this.database
      .select(locationModelColumns)
      .from(locations)
      .where(and(eq(locations.id, id), isNull(locations.deletedAt)))
      .get();

    if (!location) throw new EntityNotFoundError('Location', id);

    return location;
  }
}
