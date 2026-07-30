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
  /**
   * Defaults to `all`. This applies only within this tag or people filter, not
   * between different fields in the event query.
   */
  match?: 'all' | 'any';
};

export type EventListQuery = {
  limit: number;
  cursor?: string;

  /** Searches normalized event titles only. */
  titleSearch?: string;
  /** Selected values are matched with OR because an event has one value. */
  significance?: readonly EventSignificance[];

  /**
   * `undefined` disables the filter, while `null` selects events that have no
   * category or location.
   */
  categoryId?: UUID | null;
  locationId?: UUID | null;
  /** Empty ID arrays disable their filter. */
  tagIds?: EventMultiValueFilter;
  peopleIds?: EventMultiValueFilter;

  /** Both boundaries are inclusive. */
  dateFrom?: LocalDate;
  dateTo?: LocalDate;
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
  create(input: CreateEventInput): Promise<EventDetails>;
  update(id: UUID, input: UpdateEventInput): Promise<EventDetails>;
  softDelete(id: UUID): Promise<void>;
  restore(id: UUID): Promise<void>;
}
