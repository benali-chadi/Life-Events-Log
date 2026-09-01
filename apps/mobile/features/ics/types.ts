import type {
  CreateEventInput,
  NewEventImportMetadata,
} from '@/data/repositories';
import type { Location, Person, Tag } from '@/models';
export type ParsedIcsDateTime = {
  /** RFC 5545 date/date-time value after parsing and normalization. */
  value: string;
  isDate: boolean;
  timezone: string;
};

export type ParsedIcsAttendee = {
  uri: string;
  commonName: string | null;
  role: string | null;
  participationStatus: string | null;
  rsvp: boolean | null;
};

export type ParsedIcsRecurrence = {
  rules: string[];
  dates: string[];
  excludedDates: string[];
  recurrenceId: ParsedIcsDateTime | null;
  recurrenceRange: string | null;
};

export type ParsedIcsEvent = {
  sourceIndex: number;
  uid: string | null;
  title: string | null;
  start: ParsedIcsDateTime | null;
  end: ParsedIcsDateTime | null;
  description: string | null;
  location: string | null;
  categories: string[];
  attendees: ParsedIcsAttendee[];
  status: string | null;
  recurrence: ParsedIcsRecurrence;
  /** Kept for recurrence expansion without leaking mutable ICAL.js objects. */
  rawComponent: string;
};

export type ParsedIcsCalendar = {
  productId: string | null;
  version: string | null;
  events: ParsedIcsEvent[];
  /** VTIMEZONE definitions needed when recurrence is expanded later. */
  rawTimezones: string[];
};

export type ExpandedIcsEvent = Omit<
  ParsedIcsEvent,
  'rawComponent' | 'recurrence'
> & {
  series: {
    uid: string | null;
    recurrenceId: ParsedIcsDateTime;
  } | null;
};

export type IcsRecurrenceRange = {
  /** Inclusive local calendar date in YYYY-MM-DD form. */
  from?: string;
  /** Inclusive local calendar date in YYYY-MM-DD form. */
  to: string;
};

export type IcsImportMetadataSnapshot = {
  tags: readonly Tag[];
  people: readonly Person[];
  locations: readonly Location[];
};

export type NewIcsImportMetadata = NewEventImportMetadata;

export type IcsImportMetadataReference<TEntity> =
  | { kind: 'existing'; entity: TEntity }
  | { kind: 'new'; metadata: NewIcsImportMetadata };

export type IcsImportWarningCode =
  'missing-title' | 'title-truncated' | 'attendee-name-missing';

export type IcsImportWarning = {
  code: IcsImportWarningCode;
  message: string;
};

export type IcsImportSkipReason =
  'cancelled' | 'missing-start' | 'invalid-start';

export type SkippedIcsImportEvent = {
  sourceIndex: number;
  uid: string | null;
  title: string | null;
  reason: IcsImportSkipReason;
};

export type IcsImportCandidate = {
  id: string;
  event: Omit<
    CreateEventInput,
    'categoryId' | 'locationId' | 'tagIds' | 'peopleIds'
  >;
  tags: IcsImportMetadataReference<Tag>[];
  people: IcsImportMetadataReference<Person>[];
  location: IcsImportMetadataReference<Location> | null;
  source: {
    sourceIndex: number;
    uid: string | null;
    timezone: string;
    recurring: boolean;
  };
  warnings: IcsImportWarning[];
};

export type IcsImportMappingResult = {
  candidates: IcsImportCandidate[];
  newMetadata: {
    tags: NewIcsImportMetadata[];
    people: NewIcsImportMetadata[];
    locations: NewIcsImportMetadata[];
  };
  skipped: SkippedIcsImportEvent[];
};
