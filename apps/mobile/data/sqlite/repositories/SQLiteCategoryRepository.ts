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
  normalizeMetadataName,
} from '@/data/repositories/metadataName';
import {
  CATEGORY_COLOR_VALUES,
  type Category,
  type CategoryColor,
  type UUID,
} from '@/models';
import type { AppDatabase } from '../database';
import { categories, categoryModelColumns, events } from '../schema';

export class SQLiteCategoryRepository implements CategoryRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID): Promise<Category | null> {
    return (
      this.database
        .select(categoryModelColumns)
        .from(categories)
        .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
        .get() ?? null
    );
  }

  async list(query?: MetadataListQuery): Promise<Category[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select(categoryModelColumns)
      .from(categories)
      .where(
        and(
          isNull(categories.deletedAt),
          search
            ? sql`instr(${categories.normalizedName}, ${search}) > 0`
            : undefined
        )
      )
      .orderBy(asc(categories.normalizedName), asc(categories.id))
      .all();
  }

  async listWithUsage(
    query?: MetadataListQuery
  ): Promise<MetadataUsageItem<Category>[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select({
        metadata: categoryModelColumns,
        eventCount: count(events.id),
      })
      .from(categories)
      .leftJoin(
        events,
        and(eq(events.categoryId, categories.id), isNull(events.deletedAt))
      )
      .where(
        and(
          isNull(categories.deletedAt),
          search
            ? sql`instr(${categories.normalizedName}, ${search}) > 0`
            : undefined
        )
      )
      .groupBy(categories.id)
      .orderBy(
        desc(count(events.id)),
        asc(categories.normalizedName),
        asc(categories.id)
      )
      .all();
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

    this.database
      .insert(categories)
      .values({
        ...category,
        normalizedName: comparableMetadataName(category.name),
      })
      .run();

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
        normalizedName: comparableMetadataName(updated.name),
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
        .select(categoryModelColumns)
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

  async softDeleteMany(
    ids: readonly UUID[]
  ): Promise<SoftDeleteMetadataResult> {
    const uniqueIds = [...new Set(ids)];
    const existingIds = new Set(
      uniqueIds.length === 0
        ? []
        : this.database
            .select({ id: categories.id })
            .from(categories)
            .where(inArray(categories.id, uniqueIds))
            .all()
            .map((category) => category.id)
    );
    uniqueIds.forEach((id) => {
      if (!existingIds.has(id)) throw new EntityNotFoundError('Category', id);
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
    const duplicate = this.database
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          isNull(categories.deletedAt),
          eq(categories.normalizedName, comparableMetadataName(name)),
          excludedId ? ne(categories.id, excludedId) : undefined
        )
      )
      .get();

    if (duplicate) throw new DuplicateNameError('Category', name);
  }

  private activeCategoryOrThrow(id: UUID) {
    const category = this.database
      .select(categoryModelColumns)
      .from(categories)
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
      .get();

    if (!category) throw new EntityNotFoundError('Category', id);

    return category;
  }
}
