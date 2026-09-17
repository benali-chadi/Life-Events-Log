import type { OperationPayloadMap } from './payloads';

/** Stable replica identity. It must not be shared by independently writing replicas. */
export type DeviceId = string;
/** UUID or a canonical composite relationship key. */
export type SyncEntityId = string;
/** UTC ISO 8601 timestamp. */
export type Timestamp = string;

export const OPERATION_TYPES = [
  'entity.create',
  'entity.patch',
  'entity.delete',
  'relation.add',
  'relation.remove',
  'attachment.create',
  'attachment.delete',
  'event.attachment.reorder',
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

export const SYNC_ENTITY_TYPES = [
  'event',
  'category',
  'tag',
  'person',
  'location',
  'attachment',
  'event_tag',
  'event_person',
] as const;
export type SyncEntityType = (typeof SYNC_ENTITY_TYPES)[number];

export type OperationId = {
  originDeviceId: DeviceId;
  originSequence: number;
};

/** Complete processed prefixes; an absent origin means zero. */
export type CausalContext = Record<DeviceId, number>;

/** Independently versioned properties; creation/update timestamps are payload metadata. */
export type DomainFieldNamesByEntity = {
  event:
    | 'title'
    | 'date'
    | 'time'
    | 'significance'
    | 'category_id'
    | 'location_id'
    | 'notes'
    | 'deleted_at';
  category: 'name' | 'color' | 'deleted_at';
  tag: 'name' | 'deleted_at';
  person: 'name' | 'deleted_at';
  location: 'name' | 'deleted_at';
  attachment:
    | 'event_id'
    | 'content_hash'
    | 'filename'
    | 'mime_type'
    | 'width'
    | 'height'
    | 'file_size'
    | 'deleted_at';
  event_tag: 'deleted_at';
  event_person: 'deleted_at';
};
export type DomainFieldName = DomainFieldNamesByEntity[SyncEntityType];
export type SyncFieldName = DomainFieldName | 'attachment_order';

/** Immutable replicated content; receipt/application timestamps are local. */
type OperationEnvelope = OperationId & {
  lamport: number;
  causalContext: CausalContext;
  entityId: SyncEntityId;
  operationHash: string;
};

/* Maps operation type and and entity type to a specific payload type:
 * for example: operation type = 'entity.patch', entity type = tag,
 * this will map to the payload type: NamedMetadataCreatePayload
 */
export type Operation = {
  [TType in keyof OperationPayloadMap]: {
    [TEntity in keyof OperationPayloadMap[TType]]: OperationEnvelope & {
      operationType: TType;
      entityType: TEntity;
      payload: OperationPayloadMap[TType][TEntity];
    };
  }[keyof OperationPayloadMap[TType]];
}[keyof OperationPayloadMap];

export type OperationPayload = Operation['payload'];

export type StoredOperation = Operation & {
  receivedAt: Timestamp;
  appliedAt: Timestamp;
};

// Distribute over union members to preserve discriminator/payload correlations.
type ContentOf<T> = T extends Operation ? Omit<T, 'operationHash'> : never;
type InputOf<T> = T extends Operation
  ? Pick<T, 'operationType' | 'entityType' | 'entityId' | 'payload'>
  : never;
export type OperationContent = ContentOf<Operation>;
export type CreateOperationInput = InputOf<Operation>;

export type ConflictStatus = 'pending' | 'resolved';
