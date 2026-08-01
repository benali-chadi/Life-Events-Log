import type { EventAttachment } from './attachment';
import type { Category } from './category';
import type { Location } from './location';
import type { Person } from './person';
import type { LocalDate, LocalTime, Timestamp, UUID } from './primitives';
import type { Tag } from './tag';

export const EVENT_SIGNIFICANCE_VALUES = [
  'ordinary',
  'notable',
  'major',
  'turning-point',
] as const;

export const EVENT_TITLE_MAX_LENGTH = 100;

export type EventSignificance = (typeof EVENT_SIGNIFICANCE_VALUES)[number];

export type LELEvent = {
  id: UUID;
  title: string;
  date: LocalDate;
  time: LocalTime | null;

  significance: EventSignificance;
  categoryId: UUID | null;
  locationId: UUID | null;

  notes: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};

export type EventDetails = {
  event: LELEvent;
  category: Category | null;
  location: Location | null;
  tags: Tag[];
  people: Person[];
  attachments: EventAttachment[];
};
