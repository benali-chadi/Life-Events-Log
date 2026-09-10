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
export type JsonValue =
  string | number | boolean | null | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

/** Source properties only: normalized search columns are derived. */
export type DomainFieldNamesByEntity = {
  event:
    | 'title'
    | 'date'
    | 'time'
    | 'significance'
    | 'category_id'
    | 'location_id'
    | 'notes'
    | 'created_at'
    | 'updated_at'
    | 'deleted_at';
  category: 'name' | 'color' | 'created_at' | 'updated_at' | 'deleted_at';
  tag: 'name' | 'created_at' | 'updated_at' | 'deleted_at';
  person: 'name' | 'created_at' | 'updated_at' | 'deleted_at';
  location: 'name' | 'created_at' | 'updated_at' | 'deleted_at';
  attachment:
    | 'event_id'
    | 'filename'
    | 'mime_type'
    | 'width'
    | 'height'
    | 'file_size'
    | 'created_at'
    | 'updated_at'
    | 'deleted_at';
  event_tag: 'created_at' | 'updated_at' | 'deleted_at';
  event_person: 'created_at' | 'updated_at' | 'deleted_at';
};
export type DomainFieldName = DomainFieldNamesByEntity[SyncEntityType];
export type SyncFieldName = DomainFieldName | 'attachment_order';

/** Immutable replicated content; receipt/application timestamps are local. */
export type Operation<TPayload extends JsonObject = JsonObject> =
  OperationId & {
    lamport: number;
    causalContext: CausalContext;
    operationType: OperationType;
    entityType: SyncEntityType;
    entityId: SyncEntityId;
    payload: TPayload;
    operationHash: string;
  };

export type StoredOperation<TPayload extends JsonObject = JsonObject> =
  Operation<TPayload> & {
    receivedAt: Timestamp;
    appliedAt: Timestamp;
  };

export type CreateOperationInput<TPayload extends JsonObject = JsonObject> =
  Pick<
    Operation<TPayload>,
    'operationType' | 'entityType' | 'entityId' | 'payload'
  >;

export type ConflictStatus = 'pending' | 'resolved';
