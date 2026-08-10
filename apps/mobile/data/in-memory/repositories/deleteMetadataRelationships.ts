import type { Timestamp, UUID } from '@/models';
import type { DeleteMetadataResult } from '@/data/repositories';
import type { InMemoryDatabase } from '../types';

type MetadataRelationship = {
  eventId: UUID;
};

type DeleteMetadataRelationshipsOptions<
  TRelationship extends MetadataRelationship,
> = {
  database: InMemoryDatabase;
  metadataId: UUID;
  relationships: Map<string, TRelationship>;
  getMetadataId: (relationship: TRelationship) => UUID;
  timestamp: Timestamp;
};

export function deleteMetadataRelationships<
  TRelationship extends MetadataRelationship,
>({
  database,
  metadataId,
  relationships,
  getMetadataId,
  timestamp,
}: DeleteMetadataRelationshipsOptions<TRelationship>): DeleteMetadataResult {
  const relationshipKeys: string[] = [];
  const affectedEventIds = new Set<UUID>();

  for (const [key, relationship] of relationships) {
    if (getMetadataId(relationship) !== metadataId) continue;

    relationshipKeys.push(key);
    if (database.events.has(relationship.eventId)) {
      affectedEventIds.add(relationship.eventId);
    }
  }

  for (const key of relationshipKeys) relationships.delete(key);

  for (const eventId of affectedEventIds) {
    const event = database.events.get(eventId);
    if (!event) continue;

    database.events.set(eventId, { ...event, updatedAt: timestamp });
  }

  return { affectedEventIds: [...affectedEventIds].sort() };
}
