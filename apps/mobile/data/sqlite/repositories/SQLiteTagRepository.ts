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
  type RepositoryDependencies,
  type SoftDeleteMetadataResult,
  type TagRepository,
  type UpdateNamedMetadataInput,
} from '@/data/repositories';
import {
  comparableMetadataName,
  normalizeMetadataName,
} from '@/data/repositories/metadataName';
import type { Tag, UUID } from '@/models';
import type { AppDatabase } from '../database';
import { events, eventTags, tagModelColumns, tags } from '../schema';

export class SQLiteTagRepository implements TagRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID): Promise<Tag | null> {
    return (
      this.database
        .select(tagModelColumns)
        .from(tags)
        .where(and(eq(tags.id, id), isNull(tags.deletedAt)))
        .get() ?? null
    );
  }

  async list(query?: MetadataListQuery): Promise<Tag[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select(tagModelColumns)
      .from(tags)
      .where(
        and(
          isNull(tags.deletedAt),
          search ? sql`instr(${tags.normalizedName}, ${search}) > 0` : undefined
        )
      )
      .orderBy(asc(tags.normalizedName), asc(tags.id))
      .all();
  }

  async listWithUsage(
    query?: MetadataListQuery
  ): Promise<MetadataUsageItem<Tag>[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select({ metadata: tagModelColumns, eventCount: count(events.id) })
      .from(tags)
      .leftJoin(
        eventTags,
        and(eq(eventTags.tagId, tags.id), isNull(eventTags.deletedAt))
      )
      .leftJoin(
        events,
        and(eq(events.id, eventTags.eventId), isNull(events.deletedAt))
      )
      .where(
        and(
          isNull(tags.deletedAt),
          search ? sql`instr(${tags.normalizedName}, ${search}) > 0` : undefined
        )
      )
      .groupBy(tags.id)
      .orderBy(desc(count(events.id)), asc(tags.normalizedName), asc(tags.id))
      .all();
  }

  async create(input: CreateNamedMetadataInput): Promise<Tag> {
    const name = this.validName(input.name);
    this.assertUniqueName(name);

    const id = this.dependencies.createId();
    const existing = this.database
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.id, id))
      .get();

    if (existing) {
      throw new RepositoryError(
        `Generated duplicate tag ID “${id}”. No tag was created.`
      );
    }

    const timestamp = this.dependencies.now();
    const tag: Tag = {
      id,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    this.database
      .insert(tags)
      .values({ ...tag, normalizedName: comparableMetadataName(tag.name) })
      .run();

    return tag;
  }

  async update(id: UUID, input: UpdateNamedMetadataInput): Promise<Tag> {
    const existing = this.activeTagOrThrow(id);
    const name = this.validName(input.name);
    this.assertUniqueName(name, id);

    const updated: Tag = {
      ...existing,
      name,
      updatedAt: this.dependencies.now(),
    };

    this.database
      .update(tags)
      .set({
        name: updated.name,
        normalizedName: comparableMetadataName(updated.name),
        updatedAt: updated.updatedAt,
      })
      .where(eq(tags.id, id))
      .run();

    return updated;
  }

  async softDelete(id: UUID): Promise<SoftDeleteMetadataResult> {
    return this.database.transaction((transaction) => {
      const tag = transaction
        .select(tagModelColumns)
        .from(tags)
        .where(eq(tags.id, id))
        .get();

      if (!tag) throw new EntityNotFoundError('Tag', id);
      if (tag.deletedAt !== null) return { affectedEventIds: [] };

      const affectedEventIds = transaction
        .select({ id: eventTags.eventId })
        .from(eventTags)
        .where(and(eq(eventTags.tagId, id), isNull(eventTags.deletedAt)))
        .all()
        .map((event) => event.id)
        .sort();
      const timestamp = this.dependencies.now();

      transaction
        .update(tags)
        .set({ updatedAt: timestamp, deletedAt: timestamp })
        .where(and(eq(tags.id, id), isNull(tags.deletedAt)))
        .run();
      transaction
        .update(eventTags)
        .set({ updatedAt: timestamp, deletedAt: timestamp })
        .where(and(eq(eventTags.tagId, id), isNull(eventTags.deletedAt)))
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

  async softDeleteMany(
    ids: readonly UUID[]
  ): Promise<SoftDeleteMetadataResult> {
    const uniqueIds = [...new Set(ids)];
    const existingIds = new Set(
      uniqueIds.length === 0
        ? []
        : this.database
            .select({ id: tags.id })
            .from(tags)
            .where(inArray(tags.id, uniqueIds))
            .all()
            .map((tag) => tag.id)
    );
    uniqueIds.forEach((id) => {
      if (!existingIds.has(id)) throw new EntityNotFoundError('Tag', id);
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

    if (!name) throw new ModelValidationError('Tag name cannot be empty.');

    return name;
  }

  private assertUniqueName(name: string, excludedId?: UUID) {
    const duplicate = this.database
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          isNull(tags.deletedAt),
          eq(tags.normalizedName, comparableMetadataName(name)),
          excludedId ? ne(tags.id, excludedId) : undefined
        )
      )
      .get();

    if (duplicate) throw new DuplicateNameError('Tag', name);
  }

  private activeTagOrThrow(id: UUID) {
    const tag = this.database
      .select(tagModelColumns)
      .from(tags)
      .where(and(eq(tags.id, id), isNull(tags.deletedAt)))
      .get();

    if (!tag) throw new EntityNotFoundError('Tag', id);

    return tag;
  }
}
