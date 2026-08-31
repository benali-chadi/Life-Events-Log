import ICAL from 'ical.js';
import {
  MAX_ICS_IMPORT_EVENTS,
  MAX_ICS_OCCURRENCES_PER_SERIES,
} from './limits';
import { parseIcsEventComponent } from './parseIcs';
import type {
  ExpandedIcsEvent,
  IcsRecurrenceRange,
  ParsedIcsCalendar,
  ParsedIcsDateTime,
  ParsedIcsEvent,
} from './types';

type IcalComponent = InstanceType<typeof ICAL.Component>;
type IcalEvent = InstanceType<typeof ICAL.Event>;
type IcalTime = InstanceType<typeof ICAL.Time>;

export type IcsRecurrenceExpansionErrorCode =
  | 'invalid-range'
  | 'unbounded-recurrence'
  | 'series-occurrence-limit'
  | 'import-event-limit';

export class IcsRecurrenceExpansionError extends Error {
  constructor(
    readonly code: IcsRecurrenceExpansionErrorCode,
    message: string,
    readonly uid: string | null = null
  ) {
    super(message);
    this.name = 'IcsRecurrenceExpansionError';
  }
}

export function expandIcsRecurrences(
  parsed: ParsedIcsCalendar,
  range?: IcsRecurrenceRange
): ExpandedIcsEvent[] {
  validateRange(range);

  const calendar = rebuildCalendar(parsed);
  const components = calendar.getAllSubcomponents('vevent');
  const parsedByRawComponent = new Map(
    parsed.events.map((event) => [event.rawComponent, event])
  );
  const masters = components.filter(
    (component) => !component.hasProperty('recurrence-id')
  );
  const masterUids = new Set(
    masters
      .map((component) => component.getFirstPropertyValue('uid'))
      .filter((uid): uid is string => typeof uid === 'string')
  );
  const output: ExpandedIcsEvent[] = [];

  for (const masterComponent of masters) {
    const master = new ICAL.Event(masterComponent);
    const parsedMaster = sourceEvent(masterComponent, parsedByRawComponent);

    if (!master.isRecurring() || !parsedMaster.start) {
      pushWithinImportLimit(output, standaloneEvent(parsedMaster));
      continue;
    }

    if (hasUnboundedRule(masterComponent) && !range?.to) {
      throw new IcsRecurrenceExpansionError(
        'unbounded-recurrence',
        'An end date is required to expand an unbounded recurring event.',
        parsedMaster.uid
      );
    }

    expandSeries({
      master,
      parsedMaster,
      parsedByRawComponent,
      output,
      range,
    });
  }

  // Preserve malformed/orphaned overrides rather than silently losing them.
  for (const component of components) {
    if (!component.hasProperty('recurrence-id')) continue;
    const parsedOverride = sourceEvent(component, parsedByRawComponent);
    if (parsedOverride.uid && masterUids.has(parsedOverride.uid)) continue;
    pushWithinImportLimit(output, standaloneEvent(parsedOverride));
  }

  return output;
}

function expandSeries({
  master,
  parsedMaster,
  parsedByRawComponent,
  output,
  range,
}: {
  master: IcalEvent;
  parsedMaster: ParsedIcsEvent;
  parsedByRawComponent: ReadonlyMap<string, ParsedIcsEvent>;
  output: ExpandedIcsEvent[];
  range?: IcsRecurrenceRange;
}) {
  const iteratorStart = range?.from
    ? ICAL.Time.fromDateString(range.from)
    : undefined;
  const iterator = master.iterator(iteratorStart);
  let occurrenceCount = 0;
  let occurrence: IcalTime | null;

  while ((occurrence = iterator.next())) {
    if (range && dateKey(occurrence) > range.to) break;
    if (range?.from && dateKey(occurrence) < range.from) continue;

    if (occurrenceCount >= MAX_ICS_OCCURRENCES_PER_SERIES) {
      throw new IcsRecurrenceExpansionError(
        'series-occurrence-limit',
        `A recurring event exceeds the ${MAX_ICS_OCCURRENCES_PER_SERIES.toLocaleString()} occurrence limit.`,
        parsedMaster.uid
      );
    }

    const details = master.getOccurrenceDetails(occurrence);
    const effectiveSource = sourceEvent(
      details.item.component,
      parsedByRawComponent
    );
    const merged = mergeOverride(
      parsedMaster,
      effectiveSource,
      details.item.component
    );
    const expanded = occurrenceEvent(
      merged,
      parsedMaster,
      details.startDate,
      details.endDate,
      occurrence
    );

    occurrenceCount += 1;
    pushWithinImportLimit(output, expanded);
  }
}

function occurrenceEvent(
  effective: ParsedIcsEvent,
  master: ParsedIcsEvent,
  start: IcalTime,
  end: IcalTime,
  recurrenceId: IcalTime
): ExpandedIcsEvent {
  return {
    sourceIndex: effective.sourceIndex,
    uid: master.uid,
    title: effective.title,
    start: parsedTime(
      start,
      effective.start?.timezone ?? master.start?.timezone
    ),
    end: parsedTime(end, effective.end?.timezone ?? master.end?.timezone),
    description: effective.description,
    location: effective.location,
    categories: effective.categories,
    attendees: effective.attendees,
    status: effective.status,
    series: {
      uid: master.uid,
      recurrenceId: parsedTime(recurrenceId, master.start?.timezone),
    },
  };
}

function standaloneEvent(event: ParsedIcsEvent): ExpandedIcsEvent {
  const { rawComponent: _rawComponent, recurrence, ...values } = event;
  return {
    ...values,
    series: recurrence.recurrenceId
      ? { uid: event.uid, recurrenceId: recurrence.recurrenceId }
      : null,
  };
}

function mergeOverride(
  master: ParsedIcsEvent,
  effective: ParsedIcsEvent,
  effectiveComponent: IcalComponent
): ParsedIcsEvent {
  if (!effective.recurrence.recurrenceId) return master;

  return {
    ...effective,
    title: effectiveComponent.hasProperty('summary')
      ? effective.title
      : master.title,
    description: effectiveComponent.hasProperty('description')
      ? effective.description
      : master.description,
    location: effectiveComponent.hasProperty('location')
      ? effective.location
      : master.location,
    categories: effectiveComponent.hasProperty('categories')
      ? effective.categories
      : master.categories,
    attendees: effectiveComponent.hasProperty('attendee')
      ? effective.attendees
      : master.attendees,
    status: effectiveComponent.hasProperty('status')
      ? effective.status
      : master.status,
  };
}

function parsedTime(
  time: IcalTime,
  fallbackTimezone?: string
): ParsedIcsDateTime {
  return {
    value: time.toString(),
    isDate: time.isDate,
    timezone:
      time.zone.tzid === 'floating' && fallbackTimezone
        ? fallbackTimezone
        : time.zone.tzid,
  };
}

function sourceEvent(
  component: IcalComponent,
  parsedByRawComponent: ReadonlyMap<string, ParsedIcsEvent>
): ParsedIcsEvent {
  return (
    parsedByRawComponent.get(component.toString()) ??
    parseIcsEventComponent(component, -1)
  );
}

function rebuildCalendar(parsed: ParsedIcsCalendar): IcalComponent {
  const text = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    ...parsed.rawTimezones,
    ...parsed.events.map((event) => event.rawComponent),
    'END:VCALENDAR',
  ].join('\r\n');
  return new ICAL.Component(ICAL.parse(text));
}

function hasUnboundedRule(component: IcalComponent): boolean {
  return component.getAllProperties('rrule').some((property) => {
    const value = property.getFirstValue();
    return value instanceof ICAL.Recur && !value.isFinite();
  });
}

function pushWithinImportLimit(
  output: ExpandedIcsEvent[],
  event: ExpandedIcsEvent
) {
  if (output.length >= MAX_ICS_IMPORT_EVENTS) {
    throw new IcsRecurrenceExpansionError(
      'import-event-limit',
      `The calendar exceeds the ${MAX_ICS_IMPORT_EVENTS.toLocaleString()} event import limit.`
    );
  }
  output.push(event);
}

function dateKey(time: IcalTime): string {
  return [
    String(time.year).padStart(4, '0'),
    String(time.month).padStart(2, '0'),
    String(time.day).padStart(2, '0'),
  ].join('-');
}

function validateRange(range?: IcsRecurrenceRange) {
  if (!range) return;
  if (
    !isCalendarDate(range.to) ||
    (range.from !== undefined &&
      (!isCalendarDate(range.from) || range.from > range.to))
  ) {
    throw new IcsRecurrenceExpansionError(
      'invalid-range',
      'The recurrence range must contain valid ordered YYYY-MM-DD dates.'
    );
  }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    return ICAL.Time.fromDateString(value).toString() === value;
  } catch {
    return false;
  }
}
