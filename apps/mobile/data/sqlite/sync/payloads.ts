import type {
  Category,
  EventAttachment,
  EventPerson,
  EventTag,
  LELEvent,
  Location,
  Person,
  Tag,
} from '@/models';

/** The envelope supplies the ID; creation implies deletedAt = null. */
export type EventCreatePayload = Omit<LELEvent, 'id' | 'deletedAt'>;

/** Omitted fields remain unchanged; explicit null clears nullable fields.
 * Runtime validation must reject empty changes and undefined property values.
 */
export type EventPatchPayload = {
  changes: Partial<
    Omit<LELEvent, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
  >;
} & Pick<LELEvent, 'updatedAt'>;

type NamedMetadata = Tag | Person | Location;
export type NamedMetadataCreatePayload = Omit<
  NamedMetadata,
  'id' | 'deletedAt'
>;
export type CategoryCreatePayload = Omit<Category, 'id' | 'deletedAt'>;

export type NamedMetadataPatchPayload = {
  changes: Pick<NamedMetadata, 'name'>;
} & Pick<NamedMetadata, 'updatedAt'>;

export type CategoryPatchPayload = {
  changes: Partial<Pick<Category, 'name' | 'color'>>;
} & Pick<Category, 'updatedAt'>;

/** Shared deletion payload. Application also sets updatedAt to deletedAt. */
export type EntityDeletePayload = {
  deletedAt: NonNullable<LELEvent['deletedAt']>;
};

/** Application preserves an existing relation's createdAt on reactivation. */
export type EventTagAddPayload = Omit<EventTag, 'deletedAt'>;
export type EventPersonAddPayload = Omit<EventPerson, 'deletedAt'>;
export type RelationAddPayload = EventTagAddPayload | EventPersonAddPayload;

/** Endpoints must match the canonical composite identity in the envelope. */
export type EventTagRemovePayload = Pick<EventTag, 'eventId' | 'tagId'> &
  EntityDeletePayload;
export type EventPersonRemovePayload = Pick<
  EventPerson,
  'eventId' | 'personId'
> &
  EntityDeletePayload;
export type RelationRemovePayload =
  EventTagRemovePayload | EventPersonRemovePayload;

/** sortOrder is the author's initial position; subsequent reorder uses the event. */
export type AttachmentCreatePayload = Omit<EventAttachment, 'id' | 'deletedAt'>;
export type AttachmentReorderPayload = {
  orderedAttachmentIds: EventAttachment['id'][];
} & Pick<EventAttachment, 'updatedAt'>;

/** Allowed payloads for each operation/entity combination. */
export type OperationPayloadMap = {
  'entity.create': {
    event: EventCreatePayload;
    category: CategoryCreatePayload;
    tag: NamedMetadataCreatePayload;
    person: NamedMetadataCreatePayload;
    location: NamedMetadataCreatePayload;
  };
  'entity.patch': {
    event: EventPatchPayload;
    category: CategoryPatchPayload;
    tag: NamedMetadataPatchPayload;
    person: NamedMetadataPatchPayload;
    location: NamedMetadataPatchPayload;
  };
  'entity.delete': {
    event: EntityDeletePayload;
    category: EntityDeletePayload;
    tag: EntityDeletePayload;
    person: EntityDeletePayload;
    location: EntityDeletePayload;
  };
  'relation.add': {
    event_tag: EventTagAddPayload;
    event_person: EventPersonAddPayload;
  };
  'relation.remove': {
    event_tag: EventTagRemovePayload;
    event_person: EventPersonRemovePayload;
  };
  'attachment.create': { attachment: AttachmentCreatePayload };
  'attachment.delete': { attachment: EntityDeletePayload };
  'event.attachment.reorder': { event: AttachmentReorderPayload };
};
