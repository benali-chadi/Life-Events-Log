import { expectTypeOf, it } from 'vitest';
import type {
  AttachmentReorderPayload,
  CategoryCreatePayload,
  EventTagAddPayload,
} from './payloads';
import type {
  CreateOperationInput,
  Operation,
  OperationContent,
  PendingOperation,
  StoredOperation,
} from './types';

it('preserves payload correlations in all derived operation types', () => {
  expectTypeOf<PendingOperation>().toEqualTypeOf<CreateOperationInput>();
  expectTypeOf<keyof PendingOperation>().toEqualTypeOf<
    'operationType' | 'entityType' | 'entityId' | 'payload'
  >();
  expectTypeOf<
    Extract<
      CreateOperationInput,
      { operationType: 'entity.create'; entityType: 'category' }
    >['payload']
  >().toEqualTypeOf<CategoryCreatePayload>();
  expectTypeOf<
    Extract<
      OperationContent,
      { operationType: 'relation.add'; entityType: 'event_tag' }
    >['payload']
  >().toEqualTypeOf<EventTagAddPayload>();
  expectTypeOf<
    Extract<
      StoredOperation,
      { operationType: 'event.attachment.reorder' }
    >['payload']
  >().toEqualTypeOf<AttachmentReorderPayload>();
  expectTypeOf<
    Extract<
      Operation,
      { operationType: 'attachment.create'; entityType: 'event' }
    >
  >().toEqualTypeOf<never>();
});

it('rejects mismatched construction inputs at compile time', () => {
  // @ts-expect-error Reordering only targets an event, never a tag.
  const wrongTarget: CreateOperationInput = {
    operationType: 'event.attachment.reorder',
    entityType: 'tag',
    entityId: 'id',
    payload: { orderedAttachmentIds: [], updatedAt: 'now' },
  };
  // @ts-expect-error A category creation requires color.
  const missingColor: CreateOperationInput = {
    operationType: 'entity.create',
    entityType: 'category',
    entityId: 'id',
    payload: { name: 'Travel', createdAt: 'now', updatedAt: 'now' },
  };
  const wrongEndpoint: CreateOperationInput = {
    operationType: 'relation.add',
    entityType: 'event_tag',
    entityId: 'id',
    payload: {
      eventId: 'event',
      // @ts-expect-error A tag relation requires tagId rather than personId.
      personId: 'person',
      createdAt: 'now',
      updatedAt: 'now',
    },
  };
  void wrongTarget;
  void missingColor;
  void wrongEndpoint;
});
