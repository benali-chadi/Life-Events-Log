import type { Timestamp, UUID } from '@/models';
import type { SoftDeleteMetadataResult } from '@/data/repositories';
import type { InMemoryDatabase } from '../types';

type MetadataRelationship = {
  eventId: UUID;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};

type SoftDeleteMetadataRelationshipsOptions<
  TRelationship extends MetadataRelationship,
> = {
  database: InMemoryDatabase;
  metadataId: UUID;
  relationships: Map<string, TRelationship>;
  getMetadataId: (relationship: TRelationship) => UUID;
  timestamp: Timestamp;
};

export function softDeleteMetadataRelationships<
  TRelationship extends MetadataRelationship,
>({
  database,
  metadataId,
  relationships,
  getMetadataId,
  timestamp,
}: SoftDeleteMetadataRelationshipsOptions<TRelationship>): SoftDeleteMetadataResult {
  const affectedEventIds = new Set<UUID>();

  for (const [key, relationship] of relationships) {
    if (
      getMetadataId(relationship) !== metadataId ||
      relationship.deletedAt !== null
    ) {
      continue;
    }

    relationships.set(key, {
      ...relationship,
      updatedAt: timestamp,
      deletedAt: timestamp,
    });
    if (database.events.has(relationship.eventId)) {
      affectedEventIds.add(relationship.eventId);
    }
  }

  for (const eventId of affectedEventIds) {
    const event = database.events.get(eventId);
    if (!event) continue;

    database.events.set(eventId, { ...event, updatedAt: timestamp });
  }

  return { affectedEventIds: [...affectedEventIds].sort() };
}
