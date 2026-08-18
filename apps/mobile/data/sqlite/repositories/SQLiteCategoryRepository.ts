import { and, count, eq, isNull } from 'drizzle-orm';
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
  type SoftDeleteMetadataResult,
  type UpdateCategoryInput,
} from '@/data/repositories';
import {
  comparableMetadataName,
  compareMetadataNames,
  normalizeMetadataName,
} from '@/data/repositories/metadataName';
import {
  CATEGORY_COLOR_VALUES,
  type Category,
  type CategoryColor,
  type UUID,
} from '@/models';
import type { AppDatabase } from '../database';
import { categories, events } from '../schema';

export class SQLiteCategoryRepository implements CategoryRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID): Promise<Category | null> {
    return (
      this.database
        .select()
        .from(categories)
        .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
        .get() ?? null
    );
  }

  async list(query?: MetadataListQuery): Promise<Category[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select()
      .from(categories)
      .where(isNull(categories.deletedAt))
      .all()
      .filter(
        (category) =>
          !search || comparableMetadataName(category.name).includes(search)
      )
      .sort(compareMetadataNames);
  }

  async listWithUsage(
    query?: MetadataListQuery
  ): Promise<MetadataUsageItem<Category>[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select({
        metadata: categories,
        eventCount: count(events.id),
      })
      .from(categories)
      .leftJoin(
        events,
        and(eq(events.categoryId, categories.id), isNull(events.deletedAt))
      )
      .where(isNull(categories.deletedAt))
      .groupBy(categories.id)
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

  async create(input: CreateCategoryInput): Promise<Category> {
    const name = this.validName(input.name);
    const color = this.validColor(input.color);
    this.assertUniqueName(name);

    const id = this.dependencies.createId();
    const existing = this.database
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id))
      .get();

    if (existing) {
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

    this.database.insert(categories).values(category).run();

    return category;
  }

  async update(id: UUID, input: UpdateCategoryInput): Promise<Category> {
    const existing = this.activeCategoryOrThrow(id);
    const name =
      input.name === undefined ? existing.name : this.validName(input.name);
    const color =
      input.color === undefined ? existing.color : this.validColor(input.color);

    this.assertUniqueName(name, id);

    if (name === existing.name && color === existing.color) return existing;

    const updated: Category = {
      ...existing,
      name,
      color,
      updatedAt: this.dependencies.now(),
    };

    this.database
      .update(categories)
      .set({
        name: updated.name,
        color: updated.color,
        updatedAt: updated.updatedAt,
      })
      .where(eq(categories.id, id))
      .run();

    return updated;
  }

  async softDelete(id: UUID): Promise<SoftDeleteMetadataResult> {
    return this.database.transaction((transaction) => {
      const category = transaction
        .select()
        .from(categories)
        .where(eq(categories.id, id))
        .get();

      if (!category) throw new EntityNotFoundError('Category', id);
      if (category.deletedAt !== null) return { affectedEventIds: [] };

      const affectedEventIds = transaction
        .select({ id: events.id })
        .from(events)
        .where(eq(events.categoryId, id))
        .all()
        .map((event) => event.id)
        .sort();
      const timestamp = this.dependencies.now();

      transaction
        .update(categories)
        .set({ updatedAt: timestamp, deletedAt: timestamp })
        .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
        .run();

      return { affectedEventIds };
    });
  }

  private validName(value: string) {
    const name = normalizeMetadataName(value);

    if (!name) throw new ModelValidationError('Category name cannot be empty.');

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
    const duplicate = this.database
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(isNull(categories.deletedAt))
      .all()
      .some(
        (category) =>
          category.id !== excludedId &&
          comparableMetadataName(category.name) === comparison
      );

    if (duplicate) throw new DuplicateNameError('Category', name);
  }

  private activeCategoryOrThrow(id: UUID) {
    const category = this.database
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
      .get();

    if (!category) throw new EntityNotFoundError('Category', id);

    return category;
  }
}
