import { describe, expect, it } from 'vitest';
import type { InMemorySeed } from './types';
import { createInMemoryDatabase } from './createInMemoryDatabase';
import { InMemorySeedError } from './InMemorySeedError';
import { eventTagKey } from './relationshipKeys';
import { DEVELOPMENT_SEED } from './seed';

describe('createInMemoryDatabase', () => {
  it('normalizes seeded records and relationships into maps', () => {
    const database = createInMemoryDatabase(DEVELOPMENT_SEED);
    const relationship = DEVELOPMENT_SEED.eventTags[0];

    expect(database.events.size).toBe(DEVELOPMENT_SEED.events.length);
    expect(database.tags.size).toBe(DEVELOPMENT_SEED.tags.length);
    expect(
      database.eventTags.get(
        eventTagKey(relationship.eventId, relationship.tagId)
      )
    ).toEqual(relationship);
  });

  it('creates isolated database instances and clones seeded records', () => {
    const first = createInMemoryDatabase(DEVELOPMENT_SEED);
    const second = createInMemoryDatabase(DEVELOPMENT_SEED);
    const seededEvent = DEVELOPMENT_SEED.events[0];
    const firstEvent = first.events.get(seededEvent.id);
    const secondEvent = second.events.get(seededEvent.id);

    expect(firstEvent).not.toBe(seededEvent);
    expect(secondEvent).not.toBe(firstEvent);

    if (!firstEvent) throw new Error('Expected seeded event.');

    firstEvent.title = 'Changed in first database';

    expect(second.events.get(seededEvent.id)?.title).toBe(seededEvent.title);
    expect(seededEvent.title).toBe('Started working on Life Events Log');
  });

  it('rejects duplicate entity IDs', () => {
    const category = DEVELOPMENT_SEED.categories[0];
    const seed: InMemorySeed = {
      categories: [category, { ...category }],
    };

    expect(() => createInMemoryDatabase(seed)).toThrow(InMemorySeedError);
  });

  it('rejects relationships that reference missing records', () => {
    const event = DEVELOPMENT_SEED.events[0];
    const seed: InMemorySeed = {
      categories: DEVELOPMENT_SEED.categories,
      locations: DEVELOPMENT_SEED.locations,
      events: [event],
      eventTags: [
        {
          eventId: event.id,
          tagId: 'missing-tag',
        },
      ],
    };

    expect(() => createInMemoryDatabase(seed)).toThrow(
      /references missing tag/
    );
  });

  it('rejects duplicate relationships', () => {
    const relationship = DEVELOPMENT_SEED.eventTags[0];
    const seed: InMemorySeed = {
      categories: DEVELOPMENT_SEED.categories,
      locations: DEVELOPMENT_SEED.locations,
      events: [DEVELOPMENT_SEED.events[0]],
      tags: DEVELOPMENT_SEED.tags,
      eventTags: [relationship, { ...relationship }],
    };

    expect(() => createInMemoryDatabase(seed)).toThrow(
      /Duplicate event-tag relationship/
    );
  });
});
