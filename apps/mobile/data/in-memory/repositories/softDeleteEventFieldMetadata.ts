import type { Timestamp, UUID } from '@/models';
import {
  EntityNotFoundError,
  type SoftDeleteMetadataResult,
} from '@/data/repositories';
import type { InMemoryDatabase } from '../types';

type EventMetadataField = 'categoryId' | 'locationId';

type SoftDeleteEventFieldMetadataOptions = {
  database: InMemoryDatabase;
  metadataId: UUID;
  metadataName: 'Category' | 'Location';
  metadataTable: Map<
    UUID,
    { updatedAt: Timestamp; deletedAt: Timestamp | null }
  >;
  eventField: EventMetadataField;
  timestamp: Timestamp;
};

export function softDeleteEventFieldMetadata({
  database,
  metadataId,
  metadataName,
  metadataTable,
  eventField,
  timestamp,
}: SoftDeleteEventFieldMetadataOptions): SoftDeleteMetadataResult {
  const metadata = metadataTable.get(metadataId);
  if (!metadata) {
    throw new EntityNotFoundError(metadataName, metadataId);
  }

  if (metadata.deletedAt !== null) return { affectedEventIds: [] };

  const affectedEvents = [...database.events.values()].filter(
    (event) => event[eventField] === metadataId
  );

  metadataTable.set(metadataId, {
    ...metadata,
    updatedAt: timestamp,
    deletedAt: timestamp,
  });

  return {
    affectedEventIds: affectedEvents.map((event) => event.id).sort(),
  };
}
