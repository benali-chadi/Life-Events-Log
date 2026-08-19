import { and, count, eq, inArray, isNull } from 'drizzle-orm';
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
  compareMetadataNames,
  normalizeMetadataName,
} from '@/data/repositories/metadataName';
import type { Tag, UUID } from '@/models';
import type { AppDatabase } from '../database';
import { events, eventTags, tags } from '../schema';

export class SQLiteTagRepository implements TagRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID): Promise<Tag | null> {
    return (
      this.database
        .select()
        .from(tags)
        .where(and(eq(tags.id, id), isNull(tags.deletedAt)))
        .get() ?? null
    );
  }

  async list(query?: MetadataListQuery): Promise<Tag[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select()
      .from(tags)
      .where(isNull(tags.deletedAt))
      .all()
      .filter(
        (tag) => !search || comparableMetadataName(tag.name).includes(search)
      )
      .sort(compareMetadataNames);
  }

  async listWithUsage(
    query?: MetadataListQuery
  ): Promise<MetadataUsageItem<Tag>[]> {
    const search = query?.search ? comparableMetadataName(query.search) : '';

    return this.database
      .select({ metadata: tags, eventCount: count(events.id) })
      .from(tags)
      .leftJoin(
        eventTags,
        and(eq(eventTags.tagId, tags.id), isNull(eventTags.deletedAt))
      )
      .leftJoin(
        events,
        and(eq(events.id, eventTags.eventId), isNull(events.deletedAt))
      )
      .where(isNull(tags.deletedAt))
      .groupBy(tags.id)
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

    this.database.insert(tags).values(tag).run();

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
      .set({ name: updated.name, updatedAt: updated.updatedAt })
      .where(eq(tags.id, id))
      .run();

    return updated;
  }

  async softDelete(id: UUID): Promise<SoftDeleteMetadataResult> {
    return this.database.transaction((transaction) => {
      const tag = transaction.select().from(tags).where(eq(tags.id, id)).get();

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

  private validName(value: string) {
    const name = normalizeMetadataName(value);

    if (!name) throw new ModelValidationError('Tag name cannot be empty.');

    return name;
  }

  private assertUniqueName(name: string, excludedId?: UUID) {
    const comparison = comparableMetadataName(name);
    const duplicate = this.database
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(isNull(tags.deletedAt))
      .all()
      .some(
        (tag) =>
          tag.id !== excludedId &&
          comparableMetadataName(tag.name) === comparison
      );

    if (duplicate) throw new DuplicateNameError('Tag', name);
  }

  private activeTagOrThrow(id: UUID) {
    const tag = this.database
      .select()
      .from(tags)
      .where(and(eq(tags.id, id), isNull(tags.deletedAt)))
      .get();

    if (!tag) throw new EntityNotFoundError('Tag', id);

    return tag;
  }
}
