import {
  and,
  asc,
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
  type EventDetails,
  type EventSignificance,
  type LELEvent,
  type LocalDate,
  type LocalTime,
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
} from '@/data/repositories/metadataName';
import type { AppDatabase } from '../database';
import {
  categories,
  eventAttachments,
  eventPeople,
  events,
  eventTags,
  locations,
  people,
  tags,
} from '../schema';

type Values = Omit<CreateEventInput, 'tagIds' | 'peopleIds'> & {
  tagIds: UUID[];
  peopleIds: UUID[];
};
type WritableDatabase = Pick<AppDatabase, 'select' | 'insert' | 'update'>;
type Cursor = {
  version: 1;
  date: LocalDate;
  time: LocalTime | null;
  createdAt: string;
  id: UUID;
};
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const NOTES_PREVIEW_LENGTH = 160;

export class SQLiteEventRepository implements EventRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID): Promise<LELEvent | null> {
    return (
      this.database
        .select()
        .from(events)
        .where(and(eq(events.id, id), isNull(events.deletedAt)))
        .get() ?? null
    );
  }

  async getDetailsById(id: UUID): Promise<EventDetails | null> {
    const event = await this.getById(id);
    return event ? this.details(event) : null;
  }

  async list(query: EventListQuery) {
    const filters = this.validateListQuery(query);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const statement = this.database
      .select()
      .from(events)
      .where(and(...this.listConditions(filters, cursor)))
      .orderBy(
        desc(events.date),
        asc(sql`${events.time} IS NULL`),
        desc(events.time),
        desc(events.createdAt),
        asc(events.id)
      );
    const matching = filters.titleSearch
      ? statement
          .all()
          .filter((event) =>
            normalizeMetadataName(event.title)
              .toLowerCase()
              .includes(filters.titleSearch)
          )
      : statement.limit(query.limit + 1).all();
    const page = matching.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((event) => this.listItem(event)),
      nextCursor:
        matching.length > query.limit && last ? this.encodeCursor(last) : null,
    };
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
      tx.insert(events).values(event).run();
      this.replaceTags(id, values.tagIds, timestamp, tx);
      this.replacePeople(id, values.peopleIds, timestamp, tx);
    });
    return this.details(event);
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
      return this.details(existing);

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
      tx.update(events).set(updated).where(eq(events.id, id)).run();
      if (tagsChanged)
        this.replaceTags(id, values.tagIds, updated.updatedAt, tx);
      if (peopleChanged)
        this.replacePeople(id, values.peopleIds, updated.updatedAt, tx);
    });
    return this.details(updated);
  }

  async softDelete(id: UUID): Promise<void> {
    const event = this.eventOrThrow(id);
    if (event.deletedAt !== null) return;
    const timestamp = this.dependencies.now();
    this.database
      .update(events)
      .set({ updatedAt: timestamp, deletedAt: timestamp })
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .run();
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

  private details(event: LELEvent): EventDetails {
    const category = event.categoryId
      ? (this.database
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.id, event.categoryId),
              isNull(categories.deletedAt)
            )
          )
          .get() ?? null)
      : null;
    const location = event.locationId
      ? (this.database
          .select()
          .from(locations)
          .where(
            and(eq(locations.id, event.locationId), isNull(locations.deletedAt))
          )
          .get() ?? null)
      : null;
    const resolvedTags = this.database
      .select({ value: tags })
      .from(eventTags)
      .innerJoin(tags, eq(tags.id, eventTags.tagId))
      .where(
        and(
          eq(eventTags.eventId, event.id),
          isNull(eventTags.deletedAt),
          isNull(tags.deletedAt)
        )
      )
      .all()
      .map(({ value }) => value)
      .sort(compareMetadataNames);
    const resolvedPeople = this.database
      .select({ value: people })
      .from(eventPeople)
      .innerJoin(people, eq(people.id, eventPeople.personId))
      .where(
        and(
          eq(eventPeople.eventId, event.id),
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
          eq(eventAttachments.eventId, event.id),
          isNull(eventAttachments.deletedAt)
        )
      )
      .orderBy(eventAttachments.sortOrder, eventAttachments.id)
      .all();
    return {
      event,
      category,
      location,
      tags: resolvedTags,
      people: resolvedPeople,
      attachments,
    };
  }

  private listItem(event: LELEvent): EventListItem {
    const details = this.details(event);
    const { notes: _notes, ...withoutNotes } = details.event;
    return {
      event: { ...withoutNotes, notesPreview: this.notesPreview(event.notes) },
      category: details.category,
      location: details.location,
      tags: details.tags,
      people: details.people,
      attachmentCount: details.attachments.length,
      attachmentPreview: details.attachments[0] ?? null,
    };
  }

  private replaceTags(
    eventId: UUID,
    ids: readonly UUID[],
    at: string,
    db: WritableDatabase
  ) {
    const existing = db
      .select()
      .from(eventTags)
      .where(eq(eventTags.eventId, eventId))
      .all();
    const desired = new Set(ids);
    for (const relation of existing) {
      if (relation.deletedAt === null && !desired.has(relation.tagId)) {
        db.update(eventTags)
          .set({ updatedAt: at, deletedAt: at })
          .where(
            and(
              eq(eventTags.eventId, eventId),
              eq(eventTags.tagId, relation.tagId)
            )
          )
          .run();
      }
    }
    for (const tagId of ids) {
      if (existing.some((relation) => relation.tagId === tagId)) {
        db.update(eventTags)
          .set({ updatedAt: at, deletedAt: null })
          .where(
            and(eq(eventTags.eventId, eventId), eq(eventTags.tagId, tagId))
          )
          .run();
      } else {
        db.insert(eventTags)
          .values({
            eventId,
            tagId,
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
          })
          .run();
      }
    }
  }

  private replacePeople(
    eventId: UUID,
    ids: readonly UUID[],
    at: string,
    db: WritableDatabase
  ) {
    const existing = db
      .select()
      .from(eventPeople)
      .where(eq(eventPeople.eventId, eventId))
      .all();
    const desired = new Set(ids);
    for (const relation of existing) {
      if (relation.deletedAt === null && !desired.has(relation.personId)) {
        db.update(eventPeople)
          .set({ updatedAt: at, deletedAt: at })
          .where(
            and(
              eq(eventPeople.eventId, eventId),
              eq(eventPeople.personId, relation.personId)
            )
          )
          .run();
      }
    }
    for (const personId of ids) {
      if (existing.some((relation) => relation.personId === personId)) {
        db.update(eventPeople)
          .set({ updatedAt: at, deletedAt: null })
          .where(
            and(
              eq(eventPeople.eventId, eventId),
              eq(eventPeople.personId, personId)
            )
          )
          .run();
      } else {
        db.insert(eventPeople)
          .values({
            eventId,
            personId,
            createdAt: at,
            updatedAt: at,
            deletedAt: null,
          })
          .run();
      }
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
      titleSearch: query.search
        ? normalizeMetadataName(query.search).toLowerCase()
        : '',
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
    if (!DATE_PATTERN.test(date))
      throw new ModelValidationError(
        `Invalid event date “${date}”. Expected YYYY-MM-DD.`
      );
    const year = +date.slice(0, 4),
      month = +date.slice(5, 7),
      day = +date.slice(8, 10);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    )
      throw new ModelValidationError(`Invalid event date “${date}”.`);
  }
  private validTime(time: LocalTime | null) {
    if (time !== null && !TIME_PATTERN.test(time))
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
  private compareOrder(
    a: Pick<LELEvent, 'date' | 'time' | 'createdAt' | 'id'>,
    b: Pick<LELEvent, 'date' | 'time' | 'createdAt' | 'id'>
  ) {
    const date = b.date.localeCompare(a.date);
    if (date) return date;
    if (a.time !== null && b.time === null) return -1;
    if (a.time === null && b.time !== null) return 1;
    if (a.time && b.time) {
      const time = b.time.localeCompare(a.time);
      if (time) return time;
    }
    return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
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
      .select()
      .from(events)
      .where(eq(events.id, id))
      .get();
    if (!event) throw new EntityNotFoundError('Event', id);
    return event;
  }
  private activeEventOrThrow(id: UUID) {
    const event = this.database
      .select()
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .get();
    if (!event) throw new EntityNotFoundError('Event', id);
    return event;
  }
}
