import { and, eq, inArray, isNull } from 'drizzle-orm';
import type {
  EventExportItem,
  EventExportQuery,
  EventExportRepository,
  EventRepository,
} from '@/data/repositories';
import { compareMetadataNames } from '@/data/repositories/metadataName';
import type { Person, Tag, UUID } from '@/models';
import type { AppDatabase } from '../database';
import {
  categories,
  categoryModelColumns,
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

const EXPORT_PAGE_SIZE = 500;

export class SQLiteEventExportRepository implements EventExportRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly eventRepository: EventRepository
  ) {}

  async getByIds(ids: readonly UUID[]): Promise<EventExportItem[]> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return [];

    const rows = this.database
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
      .where(and(isNull(events.deletedAt), inArray(events.id, uniqueIds)))
      .all();

    const tagsByEvent = new Map<UUID, Tag[]>();
    for (const row of this.database
      .select({ eventId: eventTags.eventId, value: tagModelColumns })
      .from(eventTags)
      .innerJoin(tags, eq(tags.id, eventTags.tagId))
      .where(
        and(
          inArray(eventTags.eventId, uniqueIds),
          isNull(eventTags.deletedAt),
          isNull(tags.deletedAt)
        )
      )
      .all()) {
      append(tagsByEvent, row.eventId, row.value);
    }

    const peopleByEvent = new Map<UUID, Person[]>();
    for (const row of this.database
      .select({ eventId: eventPeople.eventId, value: personModelColumns })
      .from(eventPeople)
      .innerJoin(people, eq(people.id, eventPeople.personId))
      .where(
        and(
          inArray(eventPeople.eventId, uniqueIds),
          isNull(eventPeople.deletedAt),
          isNull(people.deletedAt)
        )
      )
      .all()) {
      append(peopleByEvent, row.eventId, row.value);
    }

    const byId = new Map<UUID, EventExportItem>();
    for (const row of rows) {
      byId.set(row.event.id, {
        event: row.event,
        category: row.category,
        location: row.location,
        tags: (tagsByEvent.get(row.event.id) ?? []).sort(compareMetadataNames),
        people: (peopleByEvent.get(row.event.id) ?? []).sort(
          compareMetadataNames
        ),
      });
    }

    const result: EventExportItem[] = [];
    for (const id of uniqueIds) {
      const item = byId.get(id);
      if (item) result.push(item);
    }
    return result;
  }

  async list(query: EventExportQuery): Promise<EventExportItem[]> {
    const result: EventExportItem[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.eventRepository.list({
        ...query,
        limit: EXPORT_PAGE_SIZE,
        cursor,
      });
      const ids = page.items.map((item) => item.event.id);
      result.push(...(await this.getByIds(ids)));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return result;
  }
}

function append<TEntity>(
  values: Map<UUID, TEntity[]>,
  eventId: UUID,
  value: TEntity
) {
  const existing = values.get(eventId);
  if (existing) existing.push(value);
  else values.set(eventId, [value]);
}
