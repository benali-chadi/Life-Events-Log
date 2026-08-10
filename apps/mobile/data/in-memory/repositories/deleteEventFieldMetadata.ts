import type { Timestamp, UUID } from '@/models';
import {
  EntityNotFoundError,
  type DeleteMetadataResult,
} from '@/data/repositories';
import type { InMemoryDatabase } from '../types';

type EventMetadataField = 'categoryId' | 'locationId';

type DeleteEventFieldMetadataOptions = {
  database: InMemoryDatabase;
  metadataId: UUID;
  metadataName: 'Category' | 'Location';
  metadataTable: Map<UUID, unknown>;
  eventField: EventMetadataField;
  timestamp: Timestamp;
};

export function deleteEventFieldMetadata({
  database,
  metadataId,
  metadataName,
  metadataTable,
  eventField,
  timestamp,
}: DeleteEventFieldMetadataOptions): DeleteMetadataResult {
  if (!metadataTable.has(metadataId)) {
    throw new EntityNotFoundError(metadataName, metadataId);
  }

  const affectedEvents = [...database.events.values()].filter(
    (event) => event[eventField] === metadataId
  );

  for (const event of affectedEvents) {
    database.events.set(event.id, {
      ...event,
      [eventField]: null,
      updatedAt: timestamp,
    });
  }

  metadataTable.delete(metadataId);

  return {
    affectedEventIds: affectedEvents.map((event) => event.id).sort(),
  };
}
