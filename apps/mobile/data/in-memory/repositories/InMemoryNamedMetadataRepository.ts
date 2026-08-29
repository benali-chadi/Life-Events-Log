import type { Timestamp, UUID } from '@/models';
import {
  DuplicateNameError,
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type CreateNamedMetadataInput,
  type SoftDeleteMetadataResult,
  type MetadataListQuery,
  type MetadataUsageItem,
  type NamedMetadataRepository,
  type RepositoryDependencies,
  type UpdateNamedMetadataInput,
} from '@/data/repositories';
import {
  cloneMetadataEntity,
  comparableMetadataName,
  compareMetadataNames,
  normalizeMetadataName,
} from '@/data/repositories/metadataName';

type NamedMetadataEntity = {
  id: UUID;
  name: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};

type NamedMetadataRepositoryOptions<TEntity extends NamedMetadataEntity> = {
  entityName: string;
  createEntity: (entity: NamedMetadataEntity) => TEntity;
  getUsageCounts: () => ReadonlyMap<UUID, number>;
  softDeleteReferences?: (
    id: UUID,
    timestamp: Timestamp
  ) => SoftDeleteMetadataResult;
};

export class InMemoryNamedMetadataRepository<
  TEntity extends NamedMetadataEntity,
> implements NamedMetadataRepository<TEntity> {
  constructor(
    private readonly table: Map<UUID, TEntity>,
    private readonly dependencies: RepositoryDependencies,
    private readonly options: NamedMetadataRepositoryOptions<TEntity>
  ) {}

  async getById(id: UUID) {
    const entity = this.table.get(id);

    return entity && entity.deletedAt === null
      ? cloneMetadataEntity(entity)
      : null;
  }

  async list(query?: MetadataListQuery) {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return [...this.table.values()]
      .filter(
        (entity) =>
          entity.deletedAt === null &&
          (!search || comparableMetadataName(entity.name).includes(search))
      )
      .sort(compareMetadataNames)
      .map(cloneMetadataEntity);
  }

  async listWithUsage(
    query?: MetadataListQuery
  ): Promise<MetadataUsageItem<TEntity>[]> {
    const metadata = await this.list(query);
    const usageCounts = this.options.getUsageCounts();

    return metadata
      .map((entity) => ({
        metadata: entity,
        eventCount: usageCounts.get(entity.id) ?? 0,
      }))
      .sort(
        (left, right) =>
          right.eventCount - left.eventCount ||
          compareMetadataNames(left.metadata, right.metadata)
      );
  }

  async create(input: CreateNamedMetadataInput) {
    const name = this.validName(input.name);
    this.assertUniqueName(name);

    const id = this.dependencies.createId();

    if (this.table.has(id)) {
      throw new RepositoryError(
        `Generated duplicate ${this.options.entityName.toLowerCase()} ID “${id}”. No ${this.options.entityName.toLowerCase()} was created.`
      );
    }

    const timestamp = this.dependencies.now();
    const entity = this.options.createEntity({
      id,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });

    this.table.set(id, entity);

    return cloneMetadataEntity(entity);
  }

  async update(id: UUID, input: UpdateNamedMetadataInput) {
    const existing = this.entityOrThrow(id);
    const name = this.validName(input.name);
    this.assertUniqueName(name, id);

    const updated = {
      ...existing,
      name,
      updatedAt: this.dependencies.now(),
    };

    this.table.set(id, updated);

    return cloneMetadataEntity(updated);
  }

  async softDelete(id: UUID): Promise<SoftDeleteMetadataResult> {
    return this.softDeleteMany([id]);
  }

  async softDeleteMany(
    ids: readonly UUID[]
  ): Promise<SoftDeleteMetadataResult> {
    const uniqueIds = [...new Set(ids)];
    const entities = uniqueIds.map((id) => {
      const entity = this.table.get(id);
      if (!entity) throw new EntityNotFoundError(this.options.entityName, id);
      return entity;
    });
    const activeEntities = entities.filter(
      (entity) => entity.deletedAt === null
    );
    if (activeEntities.length === 0) return { affectedEventIds: [] };

    if (!this.options.softDeleteReferences) {
      throw new RepositoryError(
        `${this.options.entityName} soft deletion is not implemented yet.`
      );
    }

    const timestamp = this.dependencies.now();
    const affectedEventIds = new Set<UUID>();
    activeEntities.forEach((entity) => {
      const result = this.options.softDeleteReferences!(entity.id, timestamp);
      result.affectedEventIds.forEach((eventId) =>
        affectedEventIds.add(eventId)
      );
      this.table.set(entity.id, {
        ...entity,
        updatedAt: timestamp,
        deletedAt: timestamp,
      });
    });

    return { affectedEventIds: [...affectedEventIds].sort() };
  }

  private validName(value: string) {
    const name = normalizeMetadataName(value);

    if (!name) {
      throw new ModelValidationError(
        `${this.options.entityName} name cannot be empty.`
      );
    }

    return name;
  }

  private assertUniqueName(name: string, excludedId?: UUID) {
    const comparison = comparableMetadataName(name);
    const duplicate = [...this.table.values()].some(
      (entity) =>
        entity.deletedAt === null &&
        entity.id !== excludedId &&
        comparableMetadataName(entity.name) === comparison
    );

    if (duplicate) {
      throw new DuplicateNameError(this.options.entityName, name);
    }
  }

  private entityOrThrow(id: UUID) {
    const entity = this.table.get(id);

    if (!entity || entity.deletedAt !== null) {
      throw new EntityNotFoundError(this.options.entityName, id);
    }

    return entity;
  }
}
