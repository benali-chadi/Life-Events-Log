import type { LELEvent, UUID } from '@/models';
import type { InMemoryDatabase } from '../types';

function increment(counts: Map<UUID, number>, metadataId: UUID) {
  counts.set(metadataId, (counts.get(metadataId) ?? 0) + 1);
}

export function countActiveEventFieldUsage(
  database: InMemoryDatabase,
  getMetadataId: (event: LELEvent) => UUID | null
) {
  const counts = new Map<UUID, number>();

  for (const event of database.events.values()) {
    if (event.deletedAt !== null) continue;

    const metadataId = getMetadataId(event);
    if (metadataId) increment(counts, metadataId);
  }

  return counts;
}

export function countActiveTagUsage(database: InMemoryDatabase) {
  const counts = new Map<UUID, number>();

  for (const relationship of database.eventTags.values()) {
    const event = database.events.get(relationship.eventId);
    if (event && event.deletedAt === null) {
      increment(counts, relationship.tagId);
    }
  }

  return counts;
}

export function countActivePersonUsage(database: InMemoryDatabase) {
  const counts = new Map<UUID, number>();

  for (const relationship of database.eventPeople.values()) {
    const event = database.events.get(relationship.eventId);
    if (event && event.deletedAt === null) {
      increment(counts, relationship.personId);
    }
  }

  return counts;
}
