import ICAL from 'ical.js';
import type {
  ParsedIcsAttendee,
  ParsedIcsCalendar,
  ParsedIcsDateTime,
  ParsedIcsEvent,
} from './types';

type IcalComponent = InstanceType<typeof ICAL.Component>;
type IcalProperty = InstanceType<typeof ICAL.Property>;
type IcalTime = InstanceType<typeof ICAL.Time>;

export class IcsParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IcsParseError';
  }
}

export function parseIcs(icsText: string): ParsedIcsCalendar {
  if (!icsText.trim()) throw new IcsParseError('The calendar file is empty.');

  let calendar: IcalComponent;
  try {
    calendar = new ICAL.Component(ICAL.parse(icsText));
  } catch (error) {
    throw new IcsParseError('The calendar file is not valid iCalendar data.', {
      cause: error,
    });
  }

  if (calendar.name !== 'vcalendar') {
    throw new IcsParseError('The file does not contain a VCALENDAR.');
  }

  return {
    productId: stringValue(calendar, 'prodid'),
    version: stringValue(calendar, 'version'),
    events: calendar
      .getAllSubcomponents('vevent')
      .map((component, sourceIndex) =>
        parseIcsEventComponent(component, sourceIndex)
      ),
    rawTimezones: calendar
      .getAllSubcomponents('vtimezone')
      .map((component) => component.toString()),
  };
}

export function parseIcsEventComponent(
  component: IcalComponent,
  sourceIndex: number
): ParsedIcsEvent {
  const recurrenceIdProperty = component.getFirstProperty('recurrence-id');

  return {
    sourceIndex,
    uid: stringValue(component, 'uid'),
    title: stringValue(component, 'summary'),
    start: timeValue(component.getFirstProperty('dtstart')),
    end: timeValue(component.getFirstProperty('dtend')),
    description: stringValue(component, 'description'),
    location: stringValue(component, 'location'),
    categories: component
      .getAllProperties('categories')
      .flatMap((property) => property.getValues())
      .filter((value): value is string => typeof value === 'string'),
    attendees: component
      .getAllProperties('attendee')
      .map(parseAttendee)
      .filter((attendee): attendee is ParsedIcsAttendee => attendee !== null),
    status: stringValue(component, 'status'),
    recurrence: {
      rules: rawProperties(component, 'rrule'),
      dates: rawProperties(component, 'rdate'),
      excludedDates: rawProperties(component, 'exdate'),
      recurrenceId: timeValue(recurrenceIdProperty),
      recurrenceRange: recurrenceIdProperty?.getFirstParameter('range') ?? null,
    },
    rawComponent: component.toString(),
  };
}

function parseAttendee(property: IcalProperty): ParsedIcsAttendee | null {
  const value = property.getFirstValue();
  if (typeof value !== 'string') return null;

  return {
    uri: value,
    commonName: optionalParameter(property, 'cn'),
    role: optionalParameter(property, 'role'),
    participationStatus: optionalParameter(property, 'partstat'),
    rsvp: booleanParameter(property, 'rsvp'),
  };
}

function timeValue(property: IcalProperty | null): ParsedIcsDateTime | null {
  if (!property) return null;
  const value = property.getFirstValue();
  if (!(value instanceof ICAL.Time)) return null;

  const time = value as IcalTime;
  return {
    value: time.toString(),
    isDate: time.isDate,
    timezone: optionalParameter(property, 'tzid') ?? time.zone.tzid,
  };
}

function stringValue(component: IcalComponent, name: string): string | null {
  const value = component.getFirstPropertyValue(name);
  return typeof value === 'string' ? value : null;
}

function rawProperties(component: IcalComponent, name: string): string[] {
  return component
    .getAllProperties(name)
    .map((property) => property.toICALString());
}

function optionalParameter(
  property: IcalProperty,
  name: string
): string | null {
  const value = property.getParameter(name);
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function booleanParameter(
  property: IcalProperty,
  name: string
): boolean | null {
  const value = optionalParameter(property, name)?.toUpperCase();
  if (value === 'TRUE') return true;
  if (value === 'FALSE') return false;
  return null;
}
