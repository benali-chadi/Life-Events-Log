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
  cloneMetadataEntity,
  comparableMetadataName,
  compareMetadataNames,
  normalizeMetadataName,
} from './namedMetadataUtils';
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
      ? cloneMetadataEntity(category)
      : null;
  }

  async list(query?: MetadataListQuery) {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return [...this.database.categories.values()]
      .filter(
        (category) =>
          category.deletedAt === null &&
          (!search || comparableMetadataName(category.name).includes(search))
      )
      .sort(compareMetadataNames)
      .map(cloneMetadataEntity);
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

    return cloneMetadataEntity(category);
  }

  async update(id: UUID, input: UpdateCategoryInput) {
    const existing = this.categoryOrThrow(id);
    const name =
      input.name === undefined ? existing.name : this.validName(input.name);
    const color =
      input.color === undefined ? existing.color : this.validColor(input.color);

    this.assertUniqueName(name, id);

    if (name === existing.name && color === existing.color) {
      return cloneMetadataEntity(existing);
    }

    const updated: Category = {
      ...existing,
      name,
      color,
      updatedAt: this.dependencies.now(),
    };

    this.database.categories.set(id, updated);

    return cloneMetadataEntity(updated);
  }

  async softDelete(id: UUID) {
    return softDeleteEventFieldMetadata({
      database: this.database,
      metadataId: id,
      metadataName: 'Category',
      metadataTable: this.database.categories,
      eventField: 'categoryId',
      timestamp: this.dependencies.now(),
    });
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
