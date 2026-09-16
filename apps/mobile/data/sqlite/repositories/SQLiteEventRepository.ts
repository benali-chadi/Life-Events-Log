import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  EVENT_SIGNIFICANCE_VALUES,
  EVENT_TITLE_MAX_LENGTH,
  type Category,
  type EventAttachment,
  type EventDetails,
  type EventSignificance,
  type LELEvent,
  type LocalDate,
  type LocalTime,
  type Location,
  type Person,
  type Tag,
  type UUID,
} from '@/models';
import {
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type CreateEventInput,
  type EventListItem,
  type EventListQuery,
  type EventMultiValueFilter,
  type EventRepository,
  type RepositoryDependencies,
  type UpdateEventInput,
} from '@/data/repositories';
import {
  compareMetadataNames,
  normalizeMetadataName,
  normalizeSearchText,
} from '@/data/repositories/metadataName';
import type { AppDatabase, SyncTransaction } from '../database';
import { createOperation } from '../sync/createOperation';
import { applyOperation } from '../sync/applyOperation';
import {
  categories,
  categoryModelColumns,
  eventAttachments,
  eventPeople,
  events,
  eventModelColumns,
  eventTags,
  locations,
  locationModelColumns,
  people,
  personModelColumns,
  tags,
  tagModelColumns,
} from '../schema';
import { isValidLocalDate, isValidLocalTime } from '@/models/validation';

type Values = Omit<CreateEventInput, 'tagIds' | 'peopleIds'> & {
  tagIds: UUID[];
  peopleIds: UUID[];
};
type Cursor = {
  version: 1;
  date: LocalDate;
  time: LocalTime | null;
  createdAt: string;
  id: UUID;
};
type EventListProjection = {
  event: LELEvent;
  category: Category | null;
  location: Location | null;
  tagsJson: string;
  peopleJson: string;
  attachmentCount: number;
  attachmentPreviewJson: string | null;
};
const NOTES_PREVIEW_LENGTH = 160;

export class SQLiteEventRepository implements EventRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID): Promise<LELEvent | null> {
    return (
      this.database
        .select(eventModelColumns)
        .from(events)
        .where(and(eq(events.id, id), isNull(events.deletedAt)))
        .get() ?? null
    );
  }

  async getDetailsById(id: UUID): Promise<EventDetails | null> {
    return this.details(id);
  }

  async list(query: EventListQuery) {
    const filters = this.validateListQuery(query);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const statement = this.database
      .select({
        event: eventModelColumns,
        category: categoryModelColumns,
        location: locationModelColumns,
        tagsJson: sql<string>`COALESCE((
          SELECT json_group_array(json_object(
            'id', ${tags.id},
            'name', ${tags.name},
            'createdAt', ${tags.createdAt},
            'updatedAt', ${tags.updatedAt},
            'deletedAt', ${tags.deletedAt}
          ))
          FROM ${eventTags}
          INNER JOIN ${tags} ON ${tags.id} = ${eventTags.tagId}
          WHERE ${eventTags.eventId} = ${events.id}
            AND ${eventTags.deletedAt} IS NULL
            AND ${tags.deletedAt} IS NULL
        ), '[]')`,
        peopleJson: sql<string>`COALESCE((
          SELECT json_group_array(json_object(
            'id', ${people.id},
            'name', ${people.name},
            'createdAt', ${people.createdAt},
            'updatedAt', ${people.updatedAt},
            'deletedAt', ${people.deletedAt}
          ))
          FROM ${eventPeople}
          INNER JOIN ${people} ON ${people.id} = ${eventPeople.personId}
          WHERE ${eventPeople.eventId} = ${events.id}
            AND ${eventPeople.deletedAt} IS NULL
            AND ${people.deletedAt} IS NULL
        ), '[]')`,
        attachmentCount: sql<number>`(
          SELECT count(*)
          FROM ${eventAttachments}
          WHERE ${eventAttachments.eventId} = ${events.id}
            AND ${eventAttachments.deletedAt} IS NULL
        )`,
        attachmentPreviewJson: sql<string | null>`(
          SELECT json_object(
            'id', ${eventAttachments.id},
            'eventId', ${eventAttachments.eventId},
            'contentHash', ${eventAttachments.contentHash},
            'filename', ${eventAttachments.filename},
            'mimeType', ${eventAttachments.mimeType},
            'width', ${eventAttachments.width},
            'height', ${eventAttachments.height},
            'fileSize', ${eventAttachments.fileSize},
            'sortOrder', ${eventAttachments.sortOrder},
            'createdAt', ${eventAttachments.createdAt},
            'updatedAt', ${eventAttachments.updatedAt},
            'deletedAt', ${eventAttachments.deletedAt}
          )
          FROM ${eventAttachments}
          WHERE ${eventAttachments.eventId} = ${events.id}
            AND ${eventAttachments.deletedAt} IS NULL
          ORDER BY ${eventAttachments.sortOrder}, ${eventAttachments.id}
          LIMIT 1
        )`,
      })
      .from(events)
      .leftJoin(
        categories,
        and(eq(categories.id, events.categoryId), isNull(categories.deletedAt))
      )
      .leftJoin(
        locations,
        and(eq(locations.id, events.locationId), isNull(locations.deletedAt))
      )
      .where(and(...this.listConditions(filters, cursor)))
      .orderBy(
        desc(events.date),
        asc(sql`${events.time} IS NULL`),
        desc(events.time),
        desc(events.createdAt),
        asc(events.id)
      );
    const matching = statement.limit(query.limit + 1).all();
    const page = matching.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.listItem(row)),
      nextCursor:
        matching.length > query.limit && last
          ? this.encodeCursor(last.event)
          : null,
    };
  }

  async count(query: EventListQuery) {
    const filters = this.validateListQuery(query);
    const result = this.database
      .select({ value: count(events.id) })
      .from(events)
      .where(and(...this.listConditions(filters, null)))
      .get();

    return result?.value ?? 0;
  }

  async create(input: CreateEventInput): Promise<EventDetails> {
    const values = this.validateValues(input, {
      category: true,
      location: true,
      tags: true,
      people: true,
    });
    const id = this.dependencies.createId();
    if (
      this.database
        .select({ id: events.id })
        .from(events)
        .where(eq(events.id, id))
        .get()
    ) {
      throw new RepositoryError(
        `Generated duplicate event ID “${id}”. No event was created.`
      );
    }
    const timestamp = this.dependencies.now();
    const event: LELEvent = {
      id,
      title: values.title,
      date: values.date,
      time: values.time,
      significance: values.significance,
      categoryId: values.categoryId,
      locationId: values.locationId,
      notes: values.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
    this.database.transaction((tx) => {
      const { id: entityId, deletedAt: _deletedAt, ...payload } = event;
      const operation = createOperation(
        {
          operationType: 'entity.create',
          entityType: 'event',
          entityId,
          payload,
        },
        tx
      );
      applyOperation(operation, tx, this.dependencies);
      this.replaceTags(id, values.tagIds, timestamp, tx);
      this.replacePeople(id, values.peopleIds, timestamp, tx);
    });
    return this.details(id)!;
  }

  async update(id: UUID, input: UpdateEventInput): Promise<EventDetails> {
    const existing = this.activeEventOrThrow(id);
    const oldTags = this.tagIds(id);
    const oldPeople = this.peopleIds(id);
    const values = this.validateValues(
      {
        title: input.title ?? existing.title,
        date: input.date ?? existing.date,
        time: input.time === undefined ? existing.time : input.time,
        significance: input.significance ?? existing.significance,
        categoryId:
          input.categoryId === undefined
            ? existing.categoryId
            : input.categoryId,
        locationId:
          input.locationId === undefined
            ? existing.locationId
            : input.locationId,
        notes: input.notes ?? existing.notes,
        tagIds: input.tagIds ?? oldTags,
        peopleIds: input.peopleIds ?? oldPeople,
      },
      {
        category: input.categoryId !== undefined,
        location: input.locationId !== undefined,
        tags: input.tagIds !== undefined,
        people: input.peopleIds !== undefined,
      }
    );
    const eventChanged =
      values.title !== existing.title ||
      values.date !== existing.date ||
      values.time !== existing.time ||
      values.significance !== existing.significance ||
      values.categoryId !== existing.categoryId ||
      values.locationId !== existing.locationId ||
      values.notes !== existing.notes;
    const tagsChanged =
      input.tagIds !== undefined && !this.sameIds(oldTags, values.tagIds);
    const peopleChanged =
      input.peopleIds !== undefined &&
      !this.sameIds(oldPeople, values.peopleIds);
    if (!eventChanged && !tagsChanged && !peopleChanged)
      return this.details(id)!;

    const updated: LELEvent = {
      ...existing,
      title: values.title,
      date: values.date,
      time: values.time,
      significance: values.significance,
      categoryId: values.categoryId,
      locationId: values.locationId,
      notes: values.notes,
      updatedAt: this.dependencies.now(),
    };
    this.database.transaction((tx) => {
      if (eventChanged) {
        const changes = {
          ...(updated.title !== existing.title ? { title: updated.title } : {}),
          ...(updated.date !== existing.date ? { date: updated.date } : {}),
          ...(updated.time !== existing.time ? { time: updated.time } : {}),
          ...(updated.significance !== existing.significance
            ? { significance: updated.significance }
            : {}),
          ...(updated.categoryId !== existing.categoryId
            ? { categoryId: updated.categoryId }
            : {}),
          ...(updated.locationId !== existing.locationId
            ? { locationId: updated.locationId }
            : {}),
          ...(updated.notes !== existing.notes ? { notes: updated.notes } : {}),
        };
        applyOperation(
          createOperation(
            {
              operationType: 'entity.patch',
              entityType: 'event',
              entityId: id,
              payload: { changes, updatedAt: updated.updatedAt },
            },
            tx
          ),
          tx,
          this.dependencies
        );
      }
      if (tagsChanged)
        this.replaceTags(id, values.tagIds, updated.updatedAt, tx);
      if (peopleChanged)
        this.replacePeople(id, values.peopleIds, updated.updatedAt, tx);
    });
    return this.details(id)!;
  }

  async softDelete(id: UUID): Promise<void> {
    await this.softDeleteMany([id]);
  }

  async softDeleteMany(ids: readonly UUID[]): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return;

    this.database.transaction((transaction) => {
      const selectedEvents = transaction
        .select({ id: events.id, deletedAt: events.deletedAt })
        .from(events)
        .where(inArray(events.id, uniqueIds))
        .all();
      const eventsById = new Map(
        selectedEvents.map((event) => [event.id, event])
      );

      uniqueIds.forEach((id) => {
        if (!eventsById.has(id)) throw new EntityNotFoundError('Event', id);
      });

      const activeIds = selectedEvents
        .filter((event) => event.deletedAt === null)
        .map((event) => event.id);
      if (activeIds.length === 0) return;

      const timestamp = this.dependencies.now();
      for (const id of activeIds) {
        applyOperation(
          createOperation(
            {
              operationType: 'entity.delete',
              entityType: 'event',
              entityId: id,
              payload: { deletedAt: timestamp },
            },
            transaction
          ),
          transaction,
          this.dependencies
        );
      }
    });
  }

  async restore(id: UUID): Promise<void> {
    const event = this.eventOrThrow(id);
    if (event.deletedAt === null) return;
    this.database
      .update(events)
      .set({ updatedAt: this.dependencies.now(), deletedAt: null })
      .where(eq(events.id, id))
      .run();
  }

  private validateValues(
    input: CreateEventInput,
    refs: {
      category: boolean;
      location: boolean;
      tags: boolean;
      people: boolean;
    }
  ): Values {
    const title = normalizeMetadataName(input.title);
    if (!title) throw new ModelValidationError('Event title cannot be empty.');
    if (title.length > EVENT_TITLE_MAX_LENGTH) {
      throw new ModelValidationError(
        `Event title cannot exceed ${EVENT_TITLE_MAX_LENGTH} characters.`
      );
    }
    this.validDate(input.date);
    this.validTime(input.time);
    this.validSignificance(input.significance);
    if (refs.category)
      this.assertReference(categories, 'Category', input.categoryId);
    if (refs.location)
      this.assertReference(locations, 'Location', input.locationId);
    return {
      ...input,
      title,
      tagIds: refs.tags
        ? this.relationshipIds(input.tagIds, tags, 'Tag')
        : [...input.tagIds],
      peopleIds: refs.people
        ? this.relationshipIds(input.peopleIds, people, 'Person')
        : [...input.peopleIds],
    };
  }

  private details(id: UUID): EventDetails | null {
    const base = this.database
      .select({
        event: eventModelColumns,
        category: categoryModelColumns,
        location: locationModelColumns,
      })
      .from(events)
      .leftJoin(
        categories,
        and(eq(categories.id, events.categoryId), isNull(categories.deletedAt))
      )
      .leftJoin(
        locations,
        and(eq(locations.id, events.locationId), isNull(locations.deletedAt))
      )
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .get();

    if (!base) return null;

    const resolvedTags = this.database
      .select({ value: tagModelColumns })
      .from(eventTags)
      .innerJoin(tags, eq(tags.id, eventTags.tagId))
      .where(
        and(
          eq(eventTags.eventId, id),
          isNull(eventTags.deletedAt),
          isNull(tags.deletedAt)
        )
      )
      .all()
      .map(({ value }) => value)
      .sort(compareMetadataNames);
    const resolvedPeople = this.database
      .select({ value: personModelColumns })
      .from(eventPeople)
      .innerJoin(people, eq(people.id, eventPeople.personId))
      .where(
        and(
          eq(eventPeople.eventId, id),
          isNull(eventPeople.deletedAt),
          isNull(people.deletedAt)
        )
      )
      .all()
      .map(({ value }) => value)
      .sort(compareMetadataNames);
    const attachments = this.database
      .select()
      .from(eventAttachments)
      .where(
        and(
          eq(eventAttachments.eventId, id),
          isNull(eventAttachments.deletedAt)
        )
      )
      .orderBy(eventAttachments.sortOrder, eventAttachments.id)
      .all();
    return {
      event: base.event,
      category: base.category,
      location: base.location,
      tags: resolvedTags,
      people: resolvedPeople,
      attachments,
    };
  }

  private listItem(row: EventListProjection): EventListItem {
    const { notes: _notes, ...withoutNotes } = row.event;
    return {
      event: {
        ...withoutNotes,
        notesPreview: this.notesPreview(row.event.notes),
      },
      category: row.category,
      location: row.location,
      tags: this.parseJsonArray<Tag>(row.tagsJson).sort(compareMetadataNames),
      people: this.parseJsonArray<Person>(row.peopleJson).sort(
        compareMetadataNames
      ),
      attachmentCount: row.attachmentCount,
      attachmentPreview: row.attachmentPreviewJson
        ? this.parseJson<EventAttachment>(row.attachmentPreviewJson)
        : null,
    };
  }

  private parseJson<T>(value: string): T {
    return JSON.parse(value) as T;
  }

  private parseJsonArray<T>(value: string): T[] {
    return this.parseJson<T[]>(value);
  }

  private replaceTags(
    eventId: UUID,
    ids: readonly UUID[],
    at: string,
    tx: SyncTransaction
  ) {
    const existing = tx
      .select()
      .from(eventTags)
      .where(eq(eventTags.eventId, eventId))
      .all();
    const desired = new Set(ids);
    for (const relation of existing) {
      if (relation.deletedAt === null && !desired.has(relation.tagId)) {
        applyOperation(
          createOperation(
            {
              operationType: 'relation.remove',
              entityType: 'event_tag',
              entityId: JSON.stringify([eventId, relation.tagId]),
              payload: { eventId, tagId: relation.tagId, deletedAt: at },
            },
            tx
          ),
          tx,
          this.dependencies
        );
      }
    }
    for (const tagId of desired) {
      const previous = existing.find((relation) => relation.tagId === tagId);
      // Skip only an already-active link. A tombstone has a non-null timestamp.
      if (previous?.deletedAt === null) continue;
      applyOperation(
        createOperation(
          {
            operationType: 'relation.add',
            entityType: 'event_tag',
            entityId: JSON.stringify([eventId, tagId]),
            payload: {
              eventId,
              tagId,
              createdAt: previous?.createdAt ?? at,
              updatedAt: at,
            },
          },
          tx
        ),
        tx,
        this.dependencies
      );
    }
  }

  private replacePeople(
    eventId: UUID,
    ids: readonly UUID[],
    at: string,
    tx: SyncTransaction
  ) {
    const existing = tx
      .select()
      .from(eventPeople)
      .where(eq(eventPeople.eventId, eventId))
      .all();
    const desired = new Set(ids);
    for (const relation of existing) {
      if (relation.deletedAt === null && !desired.has(relation.personId)) {
        applyOperation(
          createOperation(
            {
              operationType: 'relation.remove',
              entityType: 'event_person',
              entityId: JSON.stringify([eventId, relation.personId]),
              payload: { eventId, personId: relation.personId, deletedAt: at },
            },
            tx
          ),
          tx,
          this.dependencies
        );
      }
    }
    for (const personId of desired) {
      const previous = existing.find(
        (relation) => relation.personId === personId
      );
      // Missing rows and tombstones both need an addition/reactivation operation.
      if (previous?.deletedAt === null) continue;
      applyOperation(
        createOperation(
          {
            operationType: 'relation.add',
            entityType: 'event_person',
            entityId: JSON.stringify([eventId, personId]),
            payload: {
              eventId,
              personId,
              createdAt: previous?.createdAt ?? at,
              updatedAt: at,
            },
          },
          tx
        ),
        tx,
        this.dependencies
      );
    }
  }

  private tagIds(id: UUID) {
    return this.database
      .select({ id: eventTags.tagId })
      .from(eventTags)
      .where(and(eq(eventTags.eventId, id), isNull(eventTags.deletedAt)))
      .all()
      .map((row) => row.id);
  }
  private peopleIds(id: UUID) {
    return this.database
      .select({ id: eventPeople.personId })
      .from(eventPeople)
      .where(and(eq(eventPeople.eventId, id), isNull(eventPeople.deletedAt)))
      .all()
      .map((row) => row.id);
  }
  private listConditions(
    query: ReturnType<SQLiteEventRepository['validateListQuery']>,
    cursor: Cursor | null
  ) {
    const conditions: SQL[] = [isNull(events.deletedAt)];

    if (query.titleSearch) {
      conditions.push(
        sql`instr(${events.normalizedTitle}, ${query.titleSearch}) > 0`
      );
    }

    if (query.significance?.length) {
      conditions.push(inArray(events.significance, query.significance));
    }
    if (query.categoryIds?.length || query.includeUncategorized) {
      const categoryCondition = query.categoryIds?.length
        ? inArray(events.categoryId, query.categoryIds)
        : undefined;
      conditions.push(
        query.includeUncategorized
          ? or(categoryCondition, isNull(events.categoryId))!
          : categoryCondition!
      );
    }
    if (query.locationIds?.length || query.includeWithoutLocation) {
      const locationCondition = query.locationIds?.length
        ? inArray(events.locationId, query.locationIds)
        : undefined;
      conditions.push(
        query.includeWithoutLocation
          ? or(locationCondition, isNull(events.locationId))!
          : locationCondition!
      );
    }
    if (query.dateFrom) conditions.push(gte(events.date, query.dateFrom));
    if (query.dateTo) conditions.push(lte(events.date, query.dateTo));

    if (query.timeFrom && query.timeTo) {
      conditions.push(
        query.timeFrom <= query.timeTo
          ? and(
              gte(events.time, query.timeFrom),
              lte(events.time, query.timeTo)
            )!
          : or(
              gte(events.time, query.timeFrom),
              lte(events.time, query.timeTo)
            )!
      );
    } else if (query.timeFrom) {
      conditions.push(gte(events.time, query.timeFrom));
    } else if (query.timeTo) {
      conditions.push(lte(events.time, query.timeTo));
    }

    this.addTagConditions(conditions, query.tagIds);
    this.addPeopleConditions(conditions, query.peopleIds);
    if (cursor) conditions.push(this.afterCursor(cursor));

    return conditions;
  }

  private addTagConditions(
    conditions: SQL[],
    filter: EventMultiValueFilter | undefined
  ) {
    if (!filter?.ids.length) return;
    const relationshipMatches = (idCondition: SQL) => sql`EXISTS (
      SELECT 1 FROM ${eventTags}
      INNER JOIN ${tags} ON ${tags.id} = ${eventTags.tagId}
      WHERE ${eventTags.eventId} = ${events.id}
        AND ${eventTags.deletedAt} IS NULL
        AND ${tags.deletedAt} IS NULL
        AND ${idCondition}
    )`;

    if ((filter.match ?? 'all') === 'all') {
      for (const id of filter.ids) {
        conditions.push(relationshipMatches(eq(eventTags.tagId, id)));
      }
    } else {
      conditions.push(
        relationshipMatches(inArray(eventTags.tagId, filter.ids))
      );
    }
  }

  private addPeopleConditions(
    conditions: SQL[],
    filter: EventMultiValueFilter | undefined
  ) {
    if (!filter?.ids.length) return;
    const relationshipMatches = (idCondition: SQL) => sql`EXISTS (
      SELECT 1 FROM ${eventPeople}
      INNER JOIN ${people} ON ${people.id} = ${eventPeople.personId}
      WHERE ${eventPeople.eventId} = ${events.id}
        AND ${eventPeople.deletedAt} IS NULL
        AND ${people.deletedAt} IS NULL
        AND ${idCondition}
    )`;

    if ((filter.match ?? 'all') === 'all') {
      for (const id of filter.ids) {
        conditions.push(relationshipMatches(eq(eventPeople.personId, id)));
      }
    } else {
      conditions.push(
        relationshipMatches(inArray(eventPeople.personId, filter.ids))
      );
    }
  }

  private afterCursor(cursor: Cursor) {
    const afterCreation = or(
      lt(events.createdAt, cursor.createdAt),
      and(eq(events.createdAt, cursor.createdAt), gt(events.id, cursor.id))
    )!;
    const afterWithinDate =
      cursor.time === null
        ? and(isNull(events.time), afterCreation)!
        : or(
            isNull(events.time),
            lt(events.time, cursor.time),
            and(eq(events.time, cursor.time), afterCreation)
          )!;

    return or(
      lt(events.date, cursor.date),
      and(eq(events.date, cursor.date), afterWithinDate)
    )!;
  }

  private validateListQuery(query: EventListQuery) {
    if (!Number.isInteger(query.limit) || query.limit <= 0)
      throw new ModelValidationError(
        'Event list limit must be a positive integer.'
      );
    if (query.dateFrom) this.validDate(query.dateFrom);
    if (query.dateTo) this.validDate(query.dateTo);
    if (query.timeFrom) this.validTime(query.timeFrom);
    if (query.timeTo) this.validTime(query.timeTo);
    if (query.dateFrom && query.dateTo && query.dateFrom > query.dateTo)
      throw new ModelValidationError(
        'Event list dateFrom cannot be later than dateTo.'
      );
    for (const value of query.significance ?? []) this.validSignificance(value);
    this.validMultiFilter(query.tagIds, 'tag');
    this.validMultiFilter(query.peopleIds, 'people');
    return {
      ...query,
      titleSearch: query.search ? normalizeSearchText(query.search) : '',
    };
  }

  private validMultiFilter(
    filter: EventMultiValueFilter | undefined,
    name: string
  ) {
    if (filter?.match && filter.match !== 'all' && filter.match !== 'any')
      throw new ModelValidationError(
        `Invalid ${name} filter match mode “${filter.match}”.`
      );
  }
  private assertReference(
    table: typeof categories | typeof locations,
    name: string,
    id: UUID | null
  ) {
    if (id === null) return;
    if (
      !this.database
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.id, id), isNull(table.deletedAt)))
        .get()
    )
      throw new EntityNotFoundError(name, id);
  }
  private relationshipIds(
    ids: readonly UUID[],
    table: typeof tags | typeof people,
    name: string
  ) {
    const unique = new Set<UUID>();
    for (const id of ids) {
      if (unique.has(id))
        throw new ModelValidationError(
          `Event contains duplicate ${name.toLowerCase()} ID “${id}”.`
        );
      if (
        !this.database
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.id, id), isNull(table.deletedAt)))
          .get()
      )
        throw new EntityNotFoundError(name, id);
      unique.add(id);
    }
    return [...unique];
  }

  private validDate(date: LocalDate) {
    if (!isValidLocalDate(date))
      throw new ModelValidationError(
        `Invalid event date “${date}”. Expected YYYY-MM-DD.`
      );
  }
  private validTime(time: LocalTime | null) {
    if (time !== null && !isValidLocalTime(time))
      throw new ModelValidationError(
        `Invalid event time “${time}”. Expected HH:mm.`
      );
  }
  private validSignificance(value: EventSignificance) {
    if (!EVENT_SIGNIFICANCE_VALUES.includes(value))
      throw new ModelValidationError(`Invalid event significance “${value}”.`);
  }

  private notesPreview(notes: string) {
    const plain = notes
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*(?:>|[-+*]|\d+\.)\s+/gm, '')
      .replace(/[*_~`#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!plain) return null;
    return plain.length > NOTES_PREVIEW_LENGTH
      ? `${plain.slice(0, NOTES_PREVIEW_LENGTH - 1).trimEnd()}…`
      : plain;
  }
  private encodeCursor(event: LELEvent) {
    return encodeURIComponent(
      JSON.stringify({
        version: 1,
        date: event.date,
        time: event.time,
        createdAt: event.createdAt,
        id: event.id,
      } satisfies Cursor)
    );
  }
  private decodeCursor(value: string): Cursor {
    try {
      const cursor: unknown = JSON.parse(decodeURIComponent(value));
      if (
        typeof cursor === 'object' &&
        cursor !== null &&
        'version' in cursor &&
        cursor.version === 1 &&
        'date' in cursor &&
        typeof cursor.date === 'string' &&
        'time' in cursor &&
        (cursor.time === null || typeof cursor.time === 'string') &&
        'createdAt' in cursor &&
        typeof cursor.createdAt === 'string' &&
        'id' in cursor &&
        typeof cursor.id === 'string'
      ) {
        this.validDate(cursor.date as LocalDate);
        this.validTime(cursor.time as LocalTime | null);
        return cursor as Cursor;
      }
    } catch {}
    throw new ModelValidationError('Invalid event list cursor.');
  }
  private sameIds(a: readonly UUID[], b: readonly UUID[]) {
    const bIds = new Set(b);
    return a.length === b.length && a.every((id) => bIds.has(id));
  }
  private eventOrThrow(id: UUID) {
    const event = this.database
      .select(eventModelColumns)
      .from(events)
      .where(eq(events.id, id))
      .get();
    if (!event) throw new EntityNotFoundError('Event', id);
    return event;
  }
  private activeEventOrThrow(id: UUID) {
    const event = this.database
      .select(eventModelColumns)
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .get();
    if (!event) throw new EntityNotFoundError('Event', id);
    return event;
  }
}
