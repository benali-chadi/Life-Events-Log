import type { Category, Location, Person, Tag } from '@/models';
import { describe, expect, it } from 'vitest';
import { mapIcsImport } from './mapIcsImport';
import type { ExpandedIcsEvent } from '../parsing/types';

const timestamp = '2026-09-01T10:00:00.000Z';

function metadata<TEntity extends 'tag' | 'person' | 'location'>(
  type: TEntity,
  id: string,
  name: string
): TEntity extends 'tag' ? Tag : TEntity extends 'person' ? Person : Location {
  return {
    id,
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  } as TEntity extends 'tag'
    ? Tag
    : TEntity extends 'person'
      ? Person
      : Location;
}

function expandedEvent(
  overrides: Partial<ExpandedIcsEvent> = {}
): ExpandedIcsEvent {
  return {
    sourceIndex: 0,
    uid: 'event@example.com',
    title: 'Dinner',
    start: {
      value: '2026-09-05T18:30:00',
      isDate: false,
      timezone: 'Africa/Casablanca',
    },
    end: null,
    description: 'Great ramen',
    location: 'Rabat',
    categories: ['Friends', 'Food'],
    attendees: [
      {
        uri: 'mailto:youssef@example.com',
        commonName: 'Youssef',
        role: null,
        participationStatus: null,
        rsvp: null,
      },
    ],
    status: 'CONFIRMED',
    lelCategory: null,
    lelSignificance: null,
    series: null,
    ...overrides,
  };
}

describe('mapIcsImport', () => {
  it('maps event fields and resolves existing metadata by normalized name', () => {
    const friends = metadata('tag', 'tag-1', 'friends');
    const youssef = metadata('person', 'person-1', '  Youssef ');
    const rabat = metadata('location', 'location-1', 'RABAT');

    const result = mapIcsImport([expandedEvent()], {
      tags: [friends],
      people: [youssef],
      locations: [rabat],
      categories: [],
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      event: {
        title: 'Dinner',
        date: '2026-09-05',
        time: '18:30',
        notes: 'Great ramen',
        significance: 'ordinary',
      },
      people: [{ kind: 'existing', entity: { id: 'person-1' } }],
      location: { kind: 'existing', entity: { id: 'location-1' } },
      source: {
        timezone: 'Africa/Casablanca',
        recurring: false,
      },
      warnings: [],
    });
    expect(result.candidates[0]?.tags).toEqual([
      { kind: 'existing', entity: friends },
      {
        kind: 'new',
        metadata: { temporaryId: 'new:tag:food', name: 'Food' },
      },
    ]);
    expect(result.newMetadata).toEqual({
      tags: [{ temporaryId: 'new:tag:food', name: 'Food' }],
      people: [],
      locations: [],
    });
    expect(result.skipped).toEqual([]);
  });

  it('maps LEL significance and resolves imported categories by name', () => {
    const dining: Category = {
      id: 'category-1',
      name: 'Dining',
      color: 'amber',
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
    const result = mapIcsImport(
      [
        expandedEvent({
          lelCategory: { name: ' dining ', color: 'teal' },
          lelSignificance: 'NOTABLE',
        }),
      ],
      { tags: [], people: [], locations: [], categories: [dining] }
    );

    expect(result.candidates[0]).toMatchObject({
      event: { significance: 'notable' },
      category: { kind: 'existing', entity: { id: 'category-1' } },
      warnings: [],
    });
  });

  it('proposes imported categories and safely defaults invalid LEL values', () => {
    const result = mapIcsImport(
      [
        expandedEvent({
          lelCategory: { name: 'Work', color: 'ultraviolet' },
          lelSignificance: 'critical',
        }),
      ],
      { tags: [], people: [], locations: [], categories: [] }
    );

    expect(result.candidates[0]).toMatchObject({
      event: { significance: 'ordinary' },
      category: {
        kind: 'new',
        category: { name: 'Work', color: 'blue' },
      },
      warnings: [
        { code: 'invalid-significance' },
        { code: 'invalid-category-color' },
      ],
    });
  });

  it('proposes each missing metadata value once and reuses its reference', () => {
    const first = expandedEvent({
      categories: [' Travel ', 'travel'],
      location: 'Casablanca',
      attendees: [
        {
          uri: 'mailto:someone%2Bcalendar@example.com',
          commonName: null,
          role: null,
          participationStatus: null,
          rsvp: null,
        },
      ],
    });
    const second = expandedEvent({
      sourceIndex: 1,
      uid: 'event-2@example.com',
      categories: ['TRAVEL'],
      location: '  casablanca ',
      attendees: [
        {
          uri: 'mailto:someone+calendar@example.com',
          commonName: null,
          role: null,
          participationStatus: null,
          rsvp: null,
        },
      ],
    });

    const result = mapIcsImport([first, second], {
      tags: [],
      people: [],
      locations: [],
      categories: [],
    });

    expect(result.newMetadata).toEqual({
      tags: [{ temporaryId: 'new:tag:travel', name: 'Travel' }],
      people: [
        {
          temporaryId: 'new:person:someone+calendar@example.com',
          name: 'someone+calendar@example.com',
        },
      ],
      locations: [
        { temporaryId: 'new:location:casablanca', name: 'Casablanca' },
      ],
    });
    expect(result.candidates[0]?.tags).toHaveLength(1);
    expect(result.candidates[1]?.tags[0]).toStrictEqual(
      result.candidates[0]?.tags[0]
    );
    expect(result.candidates[1]?.people[0]).toStrictEqual(
      result.candidates[0]?.people[0]
    );
    expect(result.candidates[1]?.location).toStrictEqual(
      result.candidates[0]?.location
    );
  });

  it('maps all-day events without a time and marks recurring occurrences', () => {
    const result = mapIcsImport(
      [
        expandedEvent({
          start: { value: '2026-09-12', isDate: true, timezone: 'floating' },
          series: {
            uid: 'daily@example.com',
            recurrenceId: {
              value: '2026-09-12',
              isDate: true,
              timezone: 'floating',
            },
          },
        }),
      ],
      { tags: [], people: [], locations: [], categories: [] }
    );

    expect(result.candidates[0]).toMatchObject({
      event: { date: '2026-09-12', time: null },
      source: { recurring: true },
    });
  });

  it('supplies and truncates titles with visible warnings', () => {
    const result = mapIcsImport(
      [
        expandedEvent({ title: '   ' }),
        expandedEvent({ sourceIndex: 1, title: 'x'.repeat(101) }),
      ],
      { tags: [], people: [], locations: [], categories: [] }
    );

    expect(result.candidates[0]).toMatchObject({
      event: { title: 'Untitled event' },
      warnings: [{ code: 'missing-title' }],
    });
    expect(result.candidates[1]?.event.title).toHaveLength(100);
    expect(result.candidates[1]?.warnings).toEqual([
      expect.objectContaining({ code: 'title-truncated' }),
    ]);
  });

  it('skips cancelled events and events without a valid start', () => {
    const result = mapIcsImport(
      [
        expandedEvent({ status: 'cancelled' }),
        expandedEvent({ sourceIndex: 1, start: null }),
        expandedEvent({
          sourceIndex: 2,
          start: {
            value: '2026-02-30T10:00:00',
            isDate: false,
            timezone: 'floating',
          },
        }),
      ],
      { tags: [], people: [], locations: [], categories: [] }
    );

    expect(result.candidates).toEqual([]);
    expect(result.skipped.map((item) => item.reason)).toEqual([
      'cancelled',
      'missing-start',
      'invalid-start',
    ]);
  });

  it('warns and ignores attendees without a usable name', () => {
    const result = mapIcsImport(
      [
        expandedEvent({
          attendees: [
            {
              uri: 'urn:uuid:attendee-1',
              commonName: null,
              role: null,
              participationStatus: null,
              rsvp: null,
            },
          ],
        }),
      ],
      { tags: [], people: [], locations: [], categories: [] }
    );

    expect(result.candidates[0]).toMatchObject({
      people: [],
      warnings: [{ code: 'attendee-name-missing' }],
    });
  });
});
