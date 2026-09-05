import { describe, expect, it } from 'vitest';
import type { EventDetails } from '@/models';
import { parseIcs } from '../parsing/parseIcs';
import { serializeEventsToIcs } from './serializeEventsToIcs';

const EXPORTED_AT = new Date('2026-09-03T14:05:06.789Z');

describe('serializeEventsToIcs', () => {
  it('serializes all-day and timed events into one calendar', () => {
    const calendar = serializeEventsToIcs(
      [
        eventDetails({ id: 'all-day', date: '2026-09-03', time: null }),
        eventDetails({
          id: 'timed',
          title: 'Lunch, then planning',
          date: '2026-09-04',
          time: '12:30',
        }),
      ],
      EXPORTED_AT
    );

    expect(calendar).toContain('DTSTAMP:20260903T140506Z\r\n');
    expect(calendar).toContain('DTSTART;VALUE=DATE:20260903\r\n');
    expect(calendar).toContain('DTSTART:20260904T123000\r\n');
    expect(calendar).toContain('SUMMARY:Lunch\\, then planning\r\n');
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(calendar.endsWith('\r\n')).toBe(true);
  });

  it('exports metadata and preserves it through the standard import fields', () => {
    const calendar = serializeEventsToIcs(
      [
        eventDetails({
          notes: 'First line\nSecond; line',
          location: 'Rabat, Morocco',
          tags: ['Friends', 'Food, drinks'],
          people: [{ id: 'person-1', name: 'Youssef, Jr.' }],
          category: { name: 'Personal', color: 'teal' },
          significance: 'major',
        }),
      ],
      EXPORTED_AT
    );
    const [parsed] = parseIcs(calendar).events;

    expect(parsed?.description).toBe('First line\nSecond; line');
    expect(parsed?.location).toBe('Rabat, Morocco');
    expect(parsed?.categories).toEqual(['Friends', 'Food, drinks']);
    expect(parsed?.attendees[0]).toMatchObject({
      commonName: 'Youssef, Jr.',
      uri: 'urn:lel:person:person-1',
    });
    expect(calendar).toContain('X-LEL-CATEGORY;COLOR=teal:Personal\r\n');
    expect(calendar).toContain('X-LEL-SIGNIFICANCE:major\r\n');
  });

  it('folds long Unicode content lines without exceeding 75 UTF-8 octets', () => {
    const calendar = serializeEventsToIcs(
      [eventDetails({ title: `A long title ${'é🙂'.repeat(30)}` })],
      EXPORTED_AT
    );

    for (const line of calendar.split('\r\n').filter(Boolean)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(parseIcs(calendar).events[0]?.title).toBe(
      `A long title ${'é🙂'.repeat(30)}`
    );
  });

  it('rejects an invalid export timestamp', () => {
    expect(() => serializeEventsToIcs([], new Date(Number.NaN))).toThrowError(
      'The ICS export timestamp must be a valid date.'
    );
  });
});

function eventDetails({
  id = 'event-1',
  title = 'A day to remember',
  date = '2026-09-03',
  time = null,
  notes = '',
  location,
  tags = [],
  people = [],
  category,
  significance = 'ordinary',
}: {
  id?: string;
  title?: string;
  date?: EventDetails['event']['date'];
  time?: EventDetails['event']['time'];
  notes?: string;
  location?: string;
  tags?: string[];
  people?: { id: string; name: string }[];
  category?: {
    name: string;
    color: NonNullable<EventDetails['category']>['color'];
  };
  significance?: EventDetails['event']['significance'];
} = {}): EventDetails {
  const timestamps = {
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    deletedAt: null,
  };
  return {
    event: {
      id,
      title,
      date,
      time,
      notes,
      significance,
      categoryId: category ? 'category-1' : null,
      locationId: location ? 'location-1' : null,
      ...timestamps,
    },
    category: category
      ? { id: 'category-1', ...category, ...timestamps }
      : null,
    location: location
      ? { id: 'location-1', name: location, ...timestamps }
      : null,
    tags: tags.map((name, index) => ({
      id: `tag-${index}`,
      name,
      ...timestamps,
    })),
    people: people.map((person) => ({ ...person, ...timestamps })),
    attachments: [],
  };
}
