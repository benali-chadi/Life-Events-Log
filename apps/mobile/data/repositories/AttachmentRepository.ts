import type { EventAttachment, UUID } from '@/models';

export type CreateAttachmentInput = {
  eventId: UUID;
  relativePath: string;
  filename: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
};

export interface AttachmentRepository {
  getById(id: UUID): Promise<EventAttachment | null>;
  listForEvent(eventId: UUID): Promise<EventAttachment[]>;
  create(input: CreateAttachmentInput): Promise<EventAttachment>;
  reorder(
    eventId: UUID,
    attachmentIds: readonly UUID[]
  ): Promise<EventAttachment[]>;
  softDelete(id: UUID): Promise<void>;
  restore(id: UUID): Promise<void>;
}
