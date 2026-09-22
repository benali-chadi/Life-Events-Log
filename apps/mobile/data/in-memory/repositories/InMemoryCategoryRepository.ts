import {
  CATEGORY_COLOR_VALUES,
  type Category,
  type CategoryColor,
  type UUID,
} from '@/models';
import {
  DuplicateNameError,
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type CategoryRepository,
  type CreateCategoryInput,
  type MetadataListQuery,
  type MetadataUsageItem,
  type RepositoryDependencies,
  type UpdateCategoryInput,
} from '@/data/repositories';
import type { InMemoryDatabase } from '../types';
import {
  metadataWithDisplayName,
  comparableMetadataName,
  compareMetadataNames,
  normalizeMetadataName,
} from '@/data/repositories/metadataName';
import { countActiveEventFieldUsage } from './metadataUsageUtils';
import { softDeleteEventFieldMetadata } from './softDeleteEventFieldMetadata';

export class InMemoryCategoryRepository implements CategoryRepository {
  constructor(
    private readonly database: InMemoryDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID) {
    const category = this.database.categories.get(id);

    return category && category.deletedAt === null
      ? metadataWithDisplayName(category, this.database.categories.values())
      : null;
  }

  async list(query?: MetadataListQuery) {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return [...this.database.categories.values()]
      .filter(
        (category) =>
          category.deletedAt === null &&
          (!search ||
            comparableMetadataName(category.name).includes(search) ||
            comparableMetadataName(
              metadataWithDisplayName(
                category,
                this.database.categories.values()
              ).displayName
            ).includes(search))
      )
      .sort(compareMetadataNames)
      .map((entity) =>
        metadataWithDisplayName(entity, this.database.categories.values())
      );
  }

  async listWithUsage(
    query?: MetadataListQuery
  ): Promise<MetadataUsageItem<Category>[]> {
    const categories = await this.list(query);
    const usageCounts = countActiveEventFieldUsage(
      this.database,
      (event) => event.categoryId
    );

    return categories
      .map((category) => ({
        metadata: category,
        eventCount: usageCounts.get(category.id) ?? 0,
      }))
      .sort(
        (left, right) =>
          right.eventCount - left.eventCount ||
          compareMetadataNames(left.metadata, right.metadata)
      );
  }

  async create(input: CreateCategoryInput) {
    const name = this.validName(input.name);
    const color = this.validColor(input.color);
    this.assertUniqueName(name);

    const id = this.dependencies.createId();

    if (this.database.categories.has(id)) {
      throw new RepositoryError(
        `Generated duplicate category ID “${id}”. No category was created.`
      );
    }

    const timestamp = this.dependencies.now();
    const category: Category = {
      id,
      name,
      color,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    this.database.categories.set(id, category);

    return metadataWithDisplayName(category, this.database.categories.values());
  }

  async update(id: UUID, input: UpdateCategoryInput) {
    const existing = this.categoryOrThrow(id);
    const name =
      input.name === undefined ? existing.name : this.validName(input.name);
    const color =
      input.color === undefined ? existing.color : this.validColor(input.color);

    if (comparableMetadataName(name) !== comparableMetadataName(existing.name))
      this.assertUniqueName(name, id);

    if (name === existing.name && color === existing.color) {
      return metadataWithDisplayName(
        existing,
        this.database.categories.values()
      );
    }

    const updated: Category = {
      ...existing,
      name,
      color,
      updatedAt: this.dependencies.now(),
    };

    this.database.categories.set(id, updated);

    return metadataWithDisplayName(updated, this.database.categories.values());
  }

  async softDelete(id: UUID) {
    return this.softDeleteMany([id]);
  }

  async softDeleteMany(ids: readonly UUID[]) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return { affectedEventIds: [] };

    uniqueIds.forEach((id) => {
      if (!this.database.categories.has(id)) {
        throw new EntityNotFoundError('Category', id);
      }
    });
    const timestamp = this.dependencies.now();
    const affectedEventIds = new Set<UUID>();
    uniqueIds.forEach((id) => {
      softDeleteEventFieldMetadata({
        database: this.database,
        metadataId: id,
        metadataName: 'Category',
        metadataTable: this.database.categories,
        eventField: 'categoryId',
        timestamp,
      }).affectedEventIds.forEach((eventId) => affectedEventIds.add(eventId));
    });
    return { affectedEventIds: [...affectedEventIds].sort() };
  }

  private validName(value: string) {
    const name = normalizeMetadataName(value);

    if (!name) {
      throw new ModelValidationError('Category name cannot be empty.');
    }

    return name;
  }

  private validColor(value: CategoryColor) {
    if (!CATEGORY_COLOR_VALUES.includes(value)) {
      throw new ModelValidationError(`Invalid category color “${value}”.`);
    }

    return value;
  }

  private assertUniqueName(name: string, excludedId?: UUID) {
    const comparison = comparableMetadataName(name);
    const duplicate = [...this.database.categories.values()].some(
      (category) =>
        category.deletedAt === null &&
        category.id !== excludedId &&
        comparableMetadataName(category.name) === comparison
    );

    if (duplicate) throw new DuplicateNameError('Category', name);
  }

  private categoryOrThrow(id: UUID) {
    const category = this.database.categories.get(id);

    if (!category || category.deletedAt !== null) {
      throw new EntityNotFoundError('Category', id);
    }

    return category;
  }
}
