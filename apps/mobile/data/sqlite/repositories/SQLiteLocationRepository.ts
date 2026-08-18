import { and, count, eq, isNull } from 'drizzle-orm';
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
  compareMetadataNames,
  normalizeMetadataName,
} from '@/data/repositories/metadataName';
import type { Location, UUID } from '@/models';
import type { AppDatabase } from '../database';
import { events, locations } from '../schema';

export class SQLiteLocationRepository implements LocationRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID): Promise<Location | null> {
    return (
      this.database
        .select()
        .from(locations)
        .where(and(eq(locations.id, id), isNull(locations.deletedAt)))
        .get() ?? null
    );
  }

  async list(query?: MetadataListQuery): Promise<Location[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select()
      .from(locations)
      .where(isNull(locations.deletedAt))
      .all()
      .filter(
        (location) =>
          !search || comparableMetadataName(location.name).includes(search)
      )
      .sort(compareMetadataNames);
  }

  async listWithUsage(
    query?: MetadataListQuery
  ): Promise<MetadataUsageItem<Location>[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select({
        metadata: locations,
        eventCount: count(events.id),
      })
      .from(locations)
      .leftJoin(
        events,
        and(eq(events.locationId, locations.id), isNull(events.deletedAt))
      )
      .where(isNull(locations.deletedAt))
      .groupBy(locations.id)
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

    this.database.insert(locations).values(location).run();

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

    this.database
      .update(locations)
      .set({ name: updated.name, updatedAt: updated.updatedAt })
      .where(eq(locations.id, id))
      .run();

    return updated;
  }

  async softDelete(id: UUID): Promise<SoftDeleteMetadataResult> {
    return this.database.transaction((transaction) => {
      const location = transaction
        .select()
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

      transaction
        .update(locations)
        .set({ updatedAt: timestamp, deletedAt: timestamp })
        .where(and(eq(locations.id, id), isNull(locations.deletedAt)))
        .run();

      return { affectedEventIds };
    });
  }

  private validName(value: string) {
    const name = normalizeMetadataName(value);

    if (!name) throw new ModelValidationError('Location name cannot be empty.');

    return name;
  }

  private assertUniqueName(name: string, excludedId?: UUID) {
    const comparison = comparableMetadataName(name);
    const duplicate = this.database
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(isNull(locations.deletedAt))
      .all()
      .some(
        (location) =>
          location.id !== excludedId &&
          comparableMetadataName(location.name) === comparison
      );

    if (duplicate) throw new DuplicateNameError('Location', name);
  }

  private activeLocationOrThrow(id: UUID) {
    const location = this.database
      .select()
      .from(locations)
      .where(and(eq(locations.id, id), isNull(locations.deletedAt)))
      .get();

    if (!location) throw new EntityNotFoundError('Location', id);

    return location;
  }
}
