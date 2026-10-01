import {
  EVENT_SIGNIFICANCE_VALUES,
  EVENT_TITLE_MAX_LENGTH,
  type EventDetails,
  type EventPerson,
  type EventSignificance,
  type EventTag,
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
import { eventPersonKey, eventTagKey } from '../relationshipKeys';
import type { InMemoryDatabase } from '../types';
import {
  cloneMetadataEntity,
  metadataWithDisplayName,
  compareMetadataNames,
  normalizeMetadataName,
} from '@/data/repositories/metadataName';

import { isValidLocalDate, isValidLocalTime } from '@/models/validation';

type ValidatedEventValues = Omit<CreateEventInput, 'tagIds' | 'peopleIds'> & {
  tagIds: UUID[];
  peopleIds: UUID[];
};

type ReferenceValidation = {
  category: boolean;
  location: boolean;
  tags: boolean;
  people: boolean;
};

const VALIDATE_ALL_REFERENCES: ReferenceValidation = {
  category: true,
  location: true,
  tags: true,
  people: true,
};
const NOTES_PREVIEW_LENGTH = 160;

type EventCursor = {
  version: 1;
  date: LocalDate;
  time: LocalTime | null;
  createdAt: string;
  id: UUID;
};

function cloneEvent(event: LELEvent): LELEvent {
  return { ...event };
}

export class InMemoryEventRepository implements EventRepository {
  constructor(
    private readonly database: InMemoryDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID) {
    const event = this.database.events.get(id);

    return event && event.deletedAt === null ? cloneEvent(event) : null;
  }

  async getDetailsById(id: UUID) {
    const event = this.database.events.get(id);

    return event && event.deletedAt === null
      ? this.detailsForEvent(event)
      : null;
  }

  async list(query: EventListQuery) {
    const filters = this.validatedListQuery(query);
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const matchingEvents = [...this.database.events.values()]
      .filter(
        (event) =>
          event.deletedAt === null &&
          this.matchesListQuery(event, filters) &&
          (!cursor || this.compareEventOrder(event, cursor) > 0)
      )
      .sort((first, second) => this.compareEventOrder(first, second));
    const pageEvents = matchingEvents.slice(0, query.limit);
    const lastEvent = pageEvents.at(-1);

    return {
      items: pageEvents.map((event) => this.listItemForEvent(event)),
      nextCursor:
        matchingEvents.length > query.limit && lastEvent
          ? this.encodeCursor(lastEvent)
          : null,
    };
  }

  async count(query: EventListQuery) {
    const filters = this.validatedListQuery(query);

    return [...this.database.events.values()].filter(
      (event) =>
        event.deletedAt === null && this.matchesListQuery(event, filters)
    ).length;
  }

  async create(input: CreateEventInput) {
    const values = this.validatedValues(input);
    const id = this.dependencies.createId();

    if (this.database.events.has(id)) {
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

    this.database.events.set(id, event);
    this.replaceTags(id, values.tagIds, timestamp);
    this.replacePeople(id, values.peopleIds, timestamp);

    return this.detailsForEvent(event);
  }

  async update(id: UUID, input: UpdateEventInput) {
    const existing = this.activeEventOrThrow(id);
    const existingTagIds = this.tagIdsForEvent(id);
    const existingPeopleIds = this.peopleIdsForEvent(id);
    const values = this.validatedValues(
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
        tagIds: input.tagIds ?? existingTagIds,
        peopleIds: input.peopleIds ?? existingPeopleIds,
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
      input.tagIds !== undefined &&
      !this.sameIds(existingTagIds, values.tagIds);
    const peopleChanged =
      input.peopleIds !== undefined &&
      !this.sameIds(existingPeopleIds, values.peopleIds);

    if (!eventChanged && !tagsChanged && !peopleChanged) {
      return this.detailsForEvent(existing);
    }

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

    this.database.events.set(id, updated);

    if (tagsChanged) this.replaceTags(id, values.tagIds, updated.updatedAt);
    if (peopleChanged) {
      this.replacePeople(id, values.peopleIds, updated.updatedAt);
    }

    return this.detailsForEvent(updated);
  }

  async softDelete(id: UUID) {
    await this.softDeleteMany([id]);
  }

  async softDeleteMany(ids: readonly UUID[]) {
    const uniqueIds = [...new Set(ids)];
    const selectedEvents = uniqueIds.map((id) => this.eventOrThrow(id));
    const activeEvents = selectedEvents.filter(
      (event) => event.deletedAt === null
    );

    if (activeEvents.length === 0) return;

    const timestamp = this.dependencies.now();
    activeEvents.forEach((event) => {
      this.database.events.set(event.id, {
        ...event,
        updatedAt: timestamp,
        deletedAt: timestamp,
      });
    });
  }

  async restore(id: UUID) {
    const event = this.eventOrThrow(id);

    if (event.deletedAt === null) return;

    this.database.events.set(id, {
      ...event,
      updatedAt: this.dependencies.now(),
      deletedAt: null,
    });
  }

  private validatedValues(
    input: CreateEventInput,
    references: ReferenceValidation = VALIDATE_ALL_REFERENCES
  ): ValidatedEventValues {
    const title = normalizeMetadataName(input.title);

    if (!title) {
      throw new ModelValidationError('Event title cannot be empty.');
    }

    if (title.length > EVENT_TITLE_MAX_LENGTH) {
      throw new ModelValidationError(
        `Event title cannot exceed ${EVENT_TITLE_MAX_LENGTH} characters.`
      );
    }

    this.assertValidDate(input.date);
    this.assertValidTime(input.time);
    this.assertValidSignificance(input.significance);
    if (references.category) {
      this.assertExistingReference(
        this.database.categories,
        'Category',
        input.categoryId
      );
    }

    if (references.location) {
      this.assertExistingReference(
        this.database.locations,
        'Location',
        input.locationId
      );
    }

    const tagIds = references.tags
      ? this.validatedRelationshipIds(input.tagIds, this.database.tags, 'Tag')
      : [...input.tagIds];
    const peopleIds = references.people
      ? this.validatedRelationshipIds(
          input.peopleIds,
          this.database.people,
          'Person'
        )
      : [...input.peopleIds];

    return {
      ...input,
      title,
      tagIds,
      peopleIds,
    };
  }

  private validatedListQuery(query: EventListQuery) {
    if (!Number.isInteger(query.limit) || query.limit <= 0) {
      throw new ModelValidationError(
        'Event list limit must be a positive integer.'
      );
    }

    if (query.dateFrom) this.assertValidDate(query.dateFrom);
    if (query.dateTo) this.assertValidDate(query.dateTo);
    if (query.timeFrom) this.assertValidTime(query.timeFrom);
    if (query.timeTo) this.assertValidTime(query.timeTo);

    if (
      query.dateFrom &&
      query.dateTo &&
      query.dateFrom.localeCompare(query.dateTo) > 0
    ) {
      throw new ModelValidationError(
        'Event list dateFrom cannot be later than dateTo.'
      );
    }

    for (const significance of query.significance ?? []) {
      this.assertValidSignificance(significance);
    }

    this.assertValidMultiValueFilter(query.tagIds, 'tag');
    this.assertValidMultiValueFilter(query.peopleIds, 'people');

    return {
      ...query,
      titleSearch: query.search
        ? normalizeMetadataName(query.search).toLowerCase()
        : '',
    };
  }

  private assertValidMultiValueFilter(
    filter: EventMultiValueFilter | undefined,
    filterName: string
  ) {
    if (
      filter?.match !== undefined &&
      filter.match !== 'all' &&
      filter.match !== 'any'
    ) {
      throw new ModelValidationError(
        `Invalid ${filterName} filter match mode “${filter.match}”.`
      );
    }
  }

  private matchesListQuery(
    event: LELEvent,
    query: ReturnType<InMemoryEventRepository['validatedListQuery']>
  ) {
    if (
      query.titleSearch &&
      !normalizeMetadataName(event.title)
        .toLowerCase()
        .includes(query.titleSearch)
    ) {
      return false;
    }

    if (
      query.significance?.length &&
      !query.significance.includes(event.significance)
    ) {
      return false;
    }

    if (query.categoryIds?.length || query.includeUncategorized) {
      if (event.categoryId === null) {
        if (!query.includeUncategorized) return false;
      } else if (!query.categoryIds?.includes(event.categoryId)) {
        return false;
      }
    }

    if (query.locationIds?.length || query.includeWithoutLocation) {
      if (event.locationId === null) {
        if (!query.includeWithoutLocation) return false;
      } else if (!query.locationIds?.includes(event.locationId)) {
        return false;
      }
    }

    if (query.dateFrom && event.date < query.dateFrom) return false;
    if (query.dateTo && event.date > query.dateTo) return false;

    if (query.timeFrom || query.timeTo) {
      const { timeFrom, timeTo } = query;
      const { time } = event;

      if (!time) return false;

      if (timeFrom && timeTo) {
        const matchesRange =
          timeFrom <= timeTo
            ? time >= timeFrom && time <= timeTo
            : time >= timeFrom || time <= timeTo;

        if (!matchesRange) return false;
      } else if (timeFrom && time < timeFrom) {
        return false;
      } else if (timeTo && time > timeTo) {
        return false;
      }
    }

    if (
      !this.matchesMultiValueFilter(
        this.activeTagIdsForEvent(event.id),
        query.tagIds
      )
    ) {
      return false;
    }

    return this.matchesMultiValueFilter(
      this.activePeopleIdsForEvent(event.id),
      query.peopleIds
    );
  }

  private matchesMultiValueFilter(
    eventIds: ReadonlySet<UUID>,
    filter?: EventMultiValueFilter
  ) {
    if (!filter?.ids.length) return true;

    return (filter.match ?? 'all') === 'all'
      ? filter.ids.every((id) => eventIds.has(id))
      : filter.ids.some((id) => eventIds.has(id));
  }

  private listItemForEvent(event: LELEvent): EventListItem {
    const details = this.detailsForEvent(event);
    const { notes: _notes, ...eventWithoutNotes } = details.event;

    return {
      event: {
        ...eventWithoutNotes,
        notesPreview: this.notesPreview(event.notes),
      },
      category: details.category,
      location: details.location,
      tags: details.tags,
      people: details.people,
      attachmentCount: details.attachments.length,
      attachmentPreview: details.attachments[0] ?? null,
    };
  }

  private notesPreview(notes: string) {
    const plainText = notes
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*(?:>|[-+*]|\d+\.)\s+/gm, '')
      .replace(/[*_~`#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!plainText) return null;

    return plainText.length > NOTES_PREVIEW_LENGTH
      ? `${plainText.slice(0, NOTES_PREVIEW_LENGTH - 1).trimEnd()}…`
      : plainText;
  }

  private compareEventOrder(
    first: Pick<LELEvent, 'date' | 'time' | 'createdAt' | 'id'>,
    second: Pick<LELEvent, 'date' | 'time' | 'createdAt' | 'id'>
  ) {
    const dateOrder = second.date.localeCompare(first.date);

    if (dateOrder !== 0) return dateOrder;

    if (first.time !== null && second.time === null) return -1;
    if (first.time === null && second.time !== null) return 1;

    if (first.time !== null && second.time !== null) {
      const timeOrder = second.time.localeCompare(first.time);

      if (timeOrder !== 0) return timeOrder;
    }

    const creationOrder = second.createdAt.localeCompare(first.createdAt);

    return creationOrder || first.id.localeCompare(second.id);
  }

  private encodeCursor(event: LELEvent) {
    const cursor: EventCursor = {
      version: 1,
      date: event.date,
      time: event.time,
      createdAt: event.createdAt,
      id: event.id,
    };

    return encodeURIComponent(JSON.stringify(cursor));
  }

  private decodeCursor(value: string): EventCursor {
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
        this.assertValidDate(cursor.date as LocalDate);
        this.assertValidTime(cursor.time as LocalTime | null);

        return cursor as EventCursor;
      }
    } catch {
      // The public cursor is intentionally opaque; all malformed forms share
      // one repository-level validation error.
    }

    throw new ModelValidationError('Invalid event list cursor.');
  }

  private assertValidDate(date: LocalDate) {
    if (!isValidLocalDate(date)) {
      throw new ModelValidationError(
        `Invalid event date “${date}”. Expected YYYY-MM-DD.`
      );
    }
  }

  private assertValidTime(time: LocalTime | null) {
    if (time !== null && !isValidLocalTime(time)) {
      throw new ModelValidationError(
        `Invalid event time “${time}”. Expected HH:mm.`
      );
    }
  }

  private assertValidSignificance(significance: EventSignificance) {
    if (!EVENT_SIGNIFICANCE_VALUES.includes(significance)) {
      throw new ModelValidationError(
        `Invalid event significance “${significance}”.`
      );
    }
  }

  private assertExistingReference<TEntity extends { deletedAt: string | null }>(
    table: ReadonlyMap<UUID, TEntity>,
    entityName: string,
    id: UUID | null
  ) {
    if (id === null) return;

    if (table.get(id)?.deletedAt !== null) {
      throw new EntityNotFoundError(entityName, id);
    }
  }

  private validatedRelationshipIds<
    TEntity extends { deletedAt: string | null },
  >(
    ids: readonly UUID[],
    table: ReadonlyMap<UUID, TEntity>,
    entityName: string
  ) {
    const uniqueIds = new Set<UUID>();

    for (const id of ids) {
      if (uniqueIds.has(id)) {
        throw new ModelValidationError(
          `Event contains duplicate ${entityName.toLowerCase()} ID “${id}”.`
        );
      }

      this.assertExistingReference(table, entityName, id);
      uniqueIds.add(id);
    }

    return [...uniqueIds];
  }

  private detailsForEvent(event: LELEvent): EventDetails {
    const category = event.categoryId
      ? this.database.categories.get(event.categoryId)
      : null;
    const location = event.locationId
      ? this.database.locations.get(event.locationId)
      : null;
    const tags = this.tagIdsForEvent(event.id)
      .map((id) => this.database.tags.get(id))
      .filter((tag) => tag?.deletedAt === null)
      .map((tag) => metadataWithDisplayName(tag!, this.database.tags.values()))
      .sort(compareMetadataNames);
    const people = this.peopleIdsForEvent(event.id)
      .map((id) => this.database.people.get(id))
      .filter((person) => person?.deletedAt === null)
      .map((person) =>
        metadataWithDisplayName(person!, this.database.people.values())
      )
      .sort(compareMetadataNames);
    const attachments = [...this.database.attachments.values()]
      .filter(
        (attachment) =>
          attachment.eventId === event.id && attachment.deletedAt === null
      )
      .sort(
        (first, second) =>
          first.sortOrder - second.sortOrder ||
          first.id.localeCompare(second.id)
      )
      .map(cloneMetadataEntity);

    return {
      event: cloneEvent(event),
      category:
        category?.deletedAt === null
          ? metadataWithDisplayName(category, this.database.categories.values())
          : null,
      location:
        location?.deletedAt === null
          ? metadataWithDisplayName(location, this.database.locations.values())
          : null,
      tags,
      people,
      attachments,
    };
  }

  private tagIdsForEvent(eventId: UUID) {
    return [...this.database.eventTags.values()]
      .filter(
        (relationship) =>
          relationship.eventId === eventId && relationship.deletedAt === null
      )
      .map((relationship) => relationship.tagId);
  }

  private peopleIdsForEvent(eventId: UUID) {
    return [...this.database.eventPeople.values()]
      .filter(
        (relationship) =>
          relationship.eventId === eventId && relationship.deletedAt === null
      )
      .map((relationship) => relationship.personId);
  }

  private activeTagIdsForEvent(eventId: UUID) {
    return new Set(
      this.tagIdsForEvent(eventId).filter(
        (id) => this.database.tags.get(id)?.deletedAt === null
      )
    );
  }

  private activePeopleIdsForEvent(eventId: UUID) {
    return new Set(
      this.peopleIdsForEvent(eventId).filter(
        (id) => this.database.people.get(id)?.deletedAt === null
      )
    );
  }

  private replaceTags(
    eventId: UUID,
    tagIds: readonly UUID[],
    timestamp: string
  ) {
    const desiredIds = new Set(tagIds);

    for (const [key, relationship] of this.database.eventTags) {
      if (
        relationship.eventId === eventId &&
        relationship.deletedAt === null &&
        !desiredIds.has(relationship.tagId)
      ) {
        this.database.eventTags.set(key, {
          ...relationship,
          updatedAt: timestamp,
          deletedAt: timestamp,
        });
      }
    }

    for (const tagId of tagIds) {
      const key = eventTagKey(eventId, tagId);
      const existing = this.database.eventTags.get(key);
      const relationship: EventTag = existing
        ? { ...existing, updatedAt: timestamp, deletedAt: null }
        : {
            eventId,
            tagId,
            createdAt: timestamp,
            updatedAt: timestamp,
            deletedAt: null,
          };
      this.database.eventTags.set(key, relationship);
    }
  }

  private replacePeople(
    eventId: UUID,
    peopleIds: readonly UUID[],
    timestamp: string
  ) {
    const desiredIds = new Set(peopleIds);

    for (const [key, relationship] of this.database.eventPeople) {
      if (
        relationship.eventId === eventId &&
        relationship.deletedAt === null &&
        !desiredIds.has(relationship.personId)
      ) {
        this.database.eventPeople.set(key, {
          ...relationship,
          updatedAt: timestamp,
          deletedAt: timestamp,
        });
      }
    }

    for (const personId of peopleIds) {
      const key = eventPersonKey(eventId, personId);
      const existing = this.database.eventPeople.get(key);
      const relationship: EventPerson = existing
        ? { ...existing, updatedAt: timestamp, deletedAt: null }
        : {
            eventId,
            personId,
            createdAt: timestamp,
            updatedAt: timestamp,
            deletedAt: null,
          };
      this.database.eventPeople.set(key, relationship);
    }
  }

  private sameIds(first: readonly UUID[], second: readonly UUID[]) {
    if (first.length !== second.length) return false;

    const secondIds = new Set(second);

    return first.every((id) => secondIds.has(id));
  }

  private eventOrThrow(id: UUID) {
    const event = this.database.events.get(id);

    if (!event) throw new EntityNotFoundError('Event', id);

    return event;
  }

  private activeEventOrThrow(id: UUID) {
    const event = this.eventOrThrow(id);

    if (event.deletedAt !== null) {
      throw new EntityNotFoundError('Event', id);
    }

    return event;
  }
}
