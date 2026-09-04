import { describe, expect, it } from 'vitest';
import {
  expandIcsRecurrences,
  IcsRecurrenceExpansionError,
} from './expandIcsRecurrences';
import {
  MAX_ICS_IMPORT_EVENTS,
  MAX_ICS_OCCURRENCES_PER_SERIES,
} from './limits';
import { parseIcs } from './parseIcs';

function calendar(...events: string[]) {
  return parseIcs(
    ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n')
  );
}

function event(...properties: string[]) {
  return ['BEGIN:VEVENT', ...properties, 'END:VEVENT'].join('\r\n');
}

describe('expandIcsRecurrences', () => {
  it('inherits LEL extension values across recurring occurrences', () => {
    const result = expandIcsRecurrences(
      calendar(
        event(
          'UID:lel-series@example.com',
          'DTSTART:20260901T090000',
          'SUMMARY:Important series',
          'X-LEL-CATEGORY;COLOR=teal:Work',
          'X-LEL-SIGNIFICANCE:notable',
          'RRULE:FREQ=DAILY;COUNT=2'
        )
      )
    );

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lelCategory: { name: 'Work', color: 'teal' },
          lelSignificance: 'notable',
        }),
      ])
    );
    expect(result.every((item) => item.lelSignificance === 'notable')).toBe(
      true
    );
  });
  it('passes standalone events through without series metadata', () => {
    const result = expandIcsRecurrences(
      calendar(
        event(
          'UID:standalone@example.com',
          'DTSTART:20260901T090000',
          'SUMMARY:Standalone'
        )
      )
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      uid: 'standalone@example.com',
      title: 'Standalone',
      series: null,
    });
  });

  it('expands RRULE and RDATE while applying EXDATE', () => {
    const result = expandIcsRecurrences(
      calendar(
        event(
          'UID:daily@example.com',
          'DTSTART;TZID=Africa/Casablanca:20260901T090000',
          'DTEND;TZID=Africa/Casablanca:20260901T093000',
          'SUMMARY:Daily meeting',
          'RRULE:FREQ=DAILY;COUNT=3',
          'RDATE:20260910T090000',
          'EXDATE:20260902T090000'
        )
      )
    );

    expect(result.map((item) => item.start?.value)).toEqual([
      '2026-09-01T09:00:00',
      '2026-09-03T09:00:00',
      '2026-09-10T09:00:00',
    ]);
    expect(result.map((item) => item.end?.value)).toEqual([
      '2026-09-01T09:30:00',
      '2026-09-03T09:30:00',
      '2026-09-10T09:30:00',
    ]);
    expect(
      result.every((item) => item.start?.timezone === 'Africa/Casablanca')
    ).toBe(true);
    expect(
      result.every((item) => item.series?.uid === 'daily@example.com')
    ).toBe(true);
  });

  it('applies occurrence overrides and inherits omitted metadata', () => {
    const result = expandIcsRecurrences(
      calendar(
        event(
          'UID:daily@example.com',
          'DTSTART:20260901T090000',
          'DTEND:20260901T093000',
          'SUMMARY:Daily meeting',
          'DESCRIPTION:Team sync',
          'LOCATION:Room A',
          'CATEGORIES:Work',
          'ATTENDEE;CN=Youssef:mailto:youssef@example.com',
          'RRULE:FREQ=DAILY;COUNT=3'
        ),
        event(
          'UID:daily@example.com',
          'RECURRENCE-ID:20260902T090000',
          'DTSTART:20260902T100000',
          'DTEND:20260902T110000',
          'SUMMARY:Planning session',
          'LOCATION:Room B'
        )
      )
    );

    expect(result[1]).toMatchObject({
      title: 'Planning session',
      start: { value: '2026-09-02T10:00:00' },
      end: { value: '2026-09-02T11:00:00' },
      description: 'Team sync',
      location: 'Room B',
      categories: ['Work'],
      attendees: [{ commonName: 'Youssef' }],
      series: {
        uid: 'daily@example.com',
        recurrenceId: { value: '2026-09-02T09:00:00' },
      },
    });
  });

  it('requires an end date for an unbounded rule and respects a supplied range', () => {
    const parsed = calendar(
      event(
        'UID:forever@example.com',
        'DTSTART;VALUE=DATE:20260901',
        'SUMMARY:Forever',
        'RRULE:FREQ=DAILY'
      )
    );

    expect(() => expandIcsRecurrences(parsed)).toThrowError(
      expect.objectContaining({ code: 'unbounded-recurrence' })
    );

    const result = expandIcsRecurrences(parsed, {
      from: '2026-09-03',
      to: '2026-09-05',
    });
    expect(result.map((item) => item.start?.value)).toEqual([
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ]);
  });

  it('rejects a series that exceeds the occurrence limit', () => {
    const parsed = calendar(
      event(
        'UID:too-many@example.com',
        'DTSTART;VALUE=DATE:20200101',
        `RRULE:FREQ=DAILY;COUNT=${MAX_ICS_OCCURRENCES_PER_SERIES + 1}`
      )
    );

    expect(() => expandIcsRecurrences(parsed)).toThrowError(
      expect.objectContaining({ code: 'series-occurrence-limit' })
    );
  });

  it('rejects an import that exceeds the total event limit', () => {
    const parsed = calendar(
      ...Array.from({ length: MAX_ICS_IMPORT_EVENTS + 1 }, (_, index) =>
        event(`UID:event-${index}@example.com`, 'DTSTART;VALUE=DATE:20260901')
      )
    );

    expect(() => expandIcsRecurrences(parsed)).toThrowError(
      expect.objectContaining({ code: 'import-event-limit' })
    );
  }, 10_000);

  it('rejects invalid or reversed recurrence ranges', () => {
    const parsed = calendar();
    const invalidRanges = [
      { to: 'not-a-date' },
      { to: '2026-02-30' },
      { from: '2026-09-10', to: '2026-09-01' },
    ];

    for (const range of invalidRanges) {
      expect(() => expandIcsRecurrences(parsed, range)).toThrow(
        IcsRecurrenceExpansionError
      );
    }
  });
});
