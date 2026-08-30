import type {
  Category,
  EventAttachment,
  EventDetails,
  EventSignificance,
  LELEvent,
  LocalDate,
  LocalTime,
  Location,
  Person,
  Tag,
  UUID,
} from '@/models';

export type CreateEventInput = {
  title: string;
  date: LocalDate;
  time: LocalTime | null;
  significance: EventSignificance;
  categoryId: UUID | null;
  locationId: UUID | null;
  notes: string;
  tagIds: readonly UUID[];
  peopleIds: readonly UUID[];
};

/**
 * Omitted fields remain unchanged. Supplying `tagIds` or `peopleIds` replaces
 * the complete relationship set; an empty array removes every relationship.
 */
export type UpdateEventInput = Partial<CreateEventInput>;

export type EventMultiValueFilter = {
  ids: readonly UUID[];
  match?: 'all' | 'any';
};

export type EventListQuery = {
  search?: string;

  categoryIds?: readonly UUID[];
  includeUncategorized?: boolean;

  significance?: readonly EventSignificance[];

  tagIds?: EventMultiValueFilter;

  peopleIds?: EventMultiValueFilter;

  locationIds?: readonly UUID[];
  includeWithoutLocation?: boolean;

  dateFrom?: LocalDate;
  dateTo?: LocalDate;

  timeFrom?: LocalTime;
  timeTo?: LocalTime;

  limit: number;
  cursor?: string;
};

export type EventListItemEvent = Omit<LELEvent, 'notes'> & {
  notesPreview: string | null;
};

export type EventListItem = {
  event: EventListItemEvent;
  category: Category | null;
  location: Location | null;
  tags: Tag[];
  people: Person[];
  attachmentCount: number;
  attachmentPreview: EventAttachment | null;
};

export type EventPage = {
  items: EventListItem[];
  nextCursor: string | null;
};

export interface EventRepository {
  getById(id: UUID): Promise<LELEvent | null>;
  getDetailsById(id: UUID): Promise<EventDetails | null>;
  list(query: EventListQuery): Promise<EventPage>;
  count(query: EventListQuery): Promise<number>;
  create(input: CreateEventInput): Promise<EventDetails>;
  update(id: UUID, input: UpdateEventInput): Promise<EventDetails>;
  softDelete(id: UUID): Promise<void>;
  softDeleteMany(ids: readonly UUID[]): Promise<void>;
  restore(id: UUID): Promise<void>;
}
