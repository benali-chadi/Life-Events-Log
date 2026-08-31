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
