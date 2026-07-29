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
  tagIds: UUID[];
  peopleIds: UUID[];
};

export type UpdateEventInput = Partial<CreateEventInput>;

export type EventListQuery = {
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
  getById(id: UUID): Promise<EventDetails | null>;
  list(query: EventListQuery): Promise<EventPage>;
  create(input: CreateEventInput): Promise<EventDetails>;
  update(id: UUID, input: UpdateEventInput): Promise<EventDetails>;
  softDelete(id: UUID): Promise<void>;
  restore(id: UUID): Promise<void>;
}
