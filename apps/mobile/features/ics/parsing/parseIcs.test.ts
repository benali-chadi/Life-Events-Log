import { describe, expect, it } from 'vitest';
import { IcsParseError, parseIcs } from './parseIcs';

describe('parseIcs', () => {
  it('parses event fields, metadata sources, and escaped text', () => {
    const parsed = parseIcs(`BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//Life Events Log Tests//EN\r
BEGIN:VEVENT\r
UID:event-1@example.com\r
DTSTART;TZID=Africa/Casablanca:20260830T183000\r
DTEND;TZID=Africa/Casablanca:20260830T203000\r
SUMMARY:Dinner with Youssef\r
DESCRIPTION:Japanese restaurant\\nExcellent ramen\r
LOCATION:Rabat\\, Morocco\r
CATEGORIES:Friends,Food\r
ATTENDEE;CN=Youssef Alaoui;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:youssef@example.com\r
STATUS:CONFIRMED\r
X-LEL-CATEGORY;COLOR=teal:Dining\r
X-LEL-SIGNIFICANCE:notable\r
END:VEVENT\r
END:VCALENDAR\r
`);

    expect(parsed.productId).toBe('-//Life Events Log Tests//EN');
    expect(parsed.version).toBe('2.0');
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({
      sourceIndex: 0,
      uid: 'event-1@example.com',
      title: 'Dinner with Youssef',
      start: {
        value: '2026-08-30T18:30:00',
        isDate: false,
        timezone: 'Africa/Casablanca',
      },
      end: {
        value: '2026-08-30T20:30:00',
        isDate: false,
        timezone: 'Africa/Casablanca',
      },
      description: 'Japanese restaurant\nExcellent ramen',
      location: 'Rabat, Morocco',
      categories: ['Friends', 'Food'],
      status: 'CONFIRMED',
      lelCategory: { name: 'Dining', color: 'teal' },
      lelSignificance: 'notable',
      attendees: [
        {
          uri: 'mailto:youssef@example.com',
          commonName: 'Youssef Alaoui',
          role: 'REQ-PARTICIPANT',
          participationStatus: 'ACCEPTED',
          rsvp: false,
        },
      ],
    });
  });

  it('preserves all-day dates and missing optional fields', () => {
    const [event] = parseIcs(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260912
SUMMARY:Trip
END:VEVENT
END:VCALENDAR`).events;

    expect(event).toMatchObject({
      uid: null,
      start: { value: '2026-09-12', isDate: true, timezone: 'floating' },
      end: null,
      description: null,
      location: null,
      categories: [],
      attendees: [],
      lelCategory: null,
      lelSignificance: null,
    });
  });

  it('preserves recurrence definitions and occurrence overrides', () => {
    const parsed = parseIcs(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:daily@example.com
DTSTART:20260901T090000
RRULE:FREQ=DAILY;COUNT=10
RDATE:20260920T090000,20260921T090000
EXDATE:20260904T090000
SUMMARY:Daily meeting
END:VEVENT
BEGIN:VEVENT
UID:daily@example.com
RECURRENCE-ID;RANGE=THISANDFUTURE:20260903T090000
DTSTART:20260903T100000
SUMMARY:Moved daily meeting
END:VEVENT
END:VCALENDAR`);

    expect(parsed.events).toHaveLength(2);
    const master = parsed.events[0]!;
    const override = parsed.events[1]!;
    expect(master.recurrence).toMatchObject({
      rules: ['RRULE:FREQ=DAILY;COUNT=10'],
      dates: ['RDATE:20260920T090000,20260921T090000'],
      excludedDates: ['EXDATE:20260904T090000'],
      recurrenceId: null,
      recurrenceRange: null,
    });
    expect(override.recurrence).toMatchObject({
      rules: [],
      recurrenceId: {
        value: '2026-09-03T09:00:00',
        isDate: false,
        timezone: 'floating',
      },
      recurrenceRange: 'THISANDFUTURE',
    });
  });

  it('keeps timezone definitions for later recurrence expansion', () => {
    const parsed = parseIcs(`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:Custom/Zone
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0100
TZOFFSETTO:+0100
END:STANDARD
END:VTIMEZONE
END:VCALENDAR`);

    expect(parsed.rawTimezones).toHaveLength(1);
    expect(parsed.rawTimezones[0]).toContain('BEGIN:VTIMEZONE');
    expect(parsed.rawTimezones[0]).toContain('TZID:Custom/Zone');
  });

  it('rejects empty and malformed calendar data with a domain error', () => {
    expect(() => parseIcs('  ')).toThrow(IcsParseError);
    expect(() => parseIcs('not a calendar')).toThrow(IcsParseError);
  });
});
