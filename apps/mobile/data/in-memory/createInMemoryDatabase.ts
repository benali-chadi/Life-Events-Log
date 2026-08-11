import type { EventPerson, EventTag, UUID } from '@/models';
import { InMemorySeedError } from './InMemorySeedError';
import { eventPersonKey, eventTagKey } from './relationshipKeys';
import { EMPTY_IN_MEMORY_SEED } from './seed';
import type { InMemoryDatabase, InMemorySeed } from './types';

type IdentifiedRecord = {
  id: UUID;
};

function createEntityTable<TEntity extends IdentifiedRecord>(
  entityName: string,
  records: readonly TEntity[]
) {
  const table = new Map<UUID, TEntity>();

  for (const record of records) {
    if (table.has(record.id)) {
      throw new InMemorySeedError(
        `Duplicate ${entityName} ID “${record.id}” in the in-memory seed.`
      );
    }

    table.set(record.id, { ...record });
  }

  return table;
}

function assertReference(
  table: ReadonlyMap<UUID, unknown>,
  referencedEntity: string,
  referencedId: UUID,
  sourceDescription: string
) {
  if (!table.has(referencedId)) {
    throw new InMemorySeedError(
      `${sourceDescription} references missing ${referencedEntity} “${referencedId}”.`
    );
  }
}

function createRelationshipTables(
  seed: InMemorySeed,
  database: Omit<InMemoryDatabase, 'eventTags' | 'eventPeople'>
) {
  const eventTags = new Map<string, EventTag>();
  const eventPeople = new Map<string, EventPerson>();

  for (const relationship of seed.eventTags ?? []) {
    assertReference(
      database.events,
      'event',
      relationship.eventId,
      'Event-tag relationship'
    );
    assertReference(
      database.tags,
      'tag',
      relationship.tagId,
      'Event-tag relationship'
    );

    const key = eventTagKey(relationship.eventId, relationship.tagId);

    if (eventTags.has(key)) {
      throw new InMemorySeedError(
        `Duplicate event-tag relationship for event “${relationship.eventId}” and tag “${relationship.tagId}”.`
      );
    }

    eventTags.set(key, { ...relationship });
  }

  for (const relationship of seed.eventPeople ?? []) {
    assertReference(
      database.events,
      'event',
      relationship.eventId,
      'Event-person relationship'
    );
    assertReference(
      database.people,
      'person',
      relationship.personId,
      'Event-person relationship'
    );

    const key = eventPersonKey(relationship.eventId, relationship.personId);

    if (eventPeople.has(key)) {
      throw new InMemorySeedError(
        `Duplicate event-person relationship for event “${relationship.eventId}” and person “${relationship.personId}”.`
      );
    }

    eventPeople.set(key, { ...relationship });
  }

  return { eventTags, eventPeople };
}

function validateEntityReferences(
  database: Omit<InMemoryDatabase, 'eventTags' | 'eventPeople'>
) {
  for (const event of database.events.values()) {
    if (event.categoryId) {
      assertReference(
        database.categories,
        'category',
        event.categoryId,
        `Event “${event.id}”`
      );
    }

    if (event.locationId) {
      assertReference(
        database.locations,
        'location',
        event.locationId,
        `Event “${event.id}”`
      );
    }
  }

  for (const attachment of database.attachments.values()) {
    assertReference(
      database.events,
      'event',
      attachment.eventId,
      `Attachment “${attachment.id}”`
    );
  }
}

export function createInMemoryDatabase(
  seed: InMemorySeed = EMPTY_IN_MEMORY_SEED
): InMemoryDatabase {
  const entityTables = {
    events: createEntityTable('event', seed.events ?? []),
    attachments: createEntityTable('attachment', seed.attachments ?? []),
    tags: createEntityTable('tag', seed.tags ?? []),
    categories: createEntityTable('category', seed.categories ?? []),
    people: createEntityTable('person', seed.people ?? []),
    locations: createEntityTable('location', seed.locations ?? []),
  };

  validateEntityReferences(entityTables);

  return {
    ...entityTables,
    ...createRelationshipTables(seed, entityTables),
  };
}
