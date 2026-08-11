import type { EventAttachment, UUID } from '@/models';
import {
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type AttachmentRepository,
  type CreateAttachmentInput,
  type RepositoryDependencies,
} from '@/data/repositories';
import type { InMemoryDatabase } from '../types';

function cloneAttachment(attachment: EventAttachment): EventAttachment {
  return { ...attachment };
}

export class InMemoryAttachmentRepository implements AttachmentRepository {
  constructor(
    private readonly database: InMemoryDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID) {
    const attachment = this.database.attachments.get(id);

    return attachment && attachment.deletedAt === null
      ? cloneAttachment(attachment)
      : null;
  }

  async listForEvent(eventId: UUID) {
    this.activeEventOrThrow(eventId);

    return this.activeAttachmentsForEvent(eventId).map(cloneAttachment);
  }

  async create(input: CreateAttachmentInput) {
    this.activeEventOrThrow(input.eventId);
    const values = this.validatedInput(input);
    const id = this.dependencies.createId();

    if (this.database.attachments.has(id)) {
      throw new RepositoryError(
        `Generated duplicate attachment ID “${id}”. No attachment was created.`
      );
    }

    const activeAttachments = this.activeAttachmentsForEvent(input.eventId);
    const sortOrder = activeAttachments.length
      ? Math.max(
          ...activeAttachments.map((attachment) => attachment.sortOrder)
        ) + 1
      : 0;
    const timestamp = this.dependencies.now();
    const attachment: EventAttachment = {
      id,
      eventId: input.eventId,
      ...values,
      sortOrder,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    this.database.attachments.set(id, attachment);

    return cloneAttachment(attachment);
  }

  async reorder(eventId: UUID, attachmentIds: readonly UUID[]) {
    // Snapshot before validation so later caller mutations cannot affect the
    // order being persisted.
    const orderedIds = [...attachmentIds];
    this.activeEventOrThrow(eventId);

    const activeAttachments = this.activeAttachmentsForEvent(eventId);
    const uniqueIds = new Set(orderedIds);

    if (uniqueIds.size !== orderedIds.length) {
      throw new ModelValidationError(
        'Attachment reorder contains duplicate IDs.'
      );
    }

    if (orderedIds.length !== activeAttachments.length) {
      throw new ModelValidationError(
        'Attachment reorder must contain every active event attachment exactly once.'
      );
    }

    const attachmentsById = new Map(
      activeAttachments.map((attachment) => [attachment.id, attachment])
    );

    for (const id of orderedIds) {
      const attachment = this.database.attachments.get(id);

      if (!attachment || attachment.deletedAt !== null) {
        throw new EntityNotFoundError('Attachment', id);
      }

      if (attachment.eventId !== eventId) {
        throw new ModelValidationError(
          `Attachment “${id}” does not belong to event “${eventId}”.`
        );
      }

      if (!attachmentsById.has(id)) {
        throw new ModelValidationError(
          'Attachment reorder must contain every active event attachment exactly once.'
        );
      }
    }

    const hasChanges = orderedIds.some(
      (id, sortOrder) => attachmentsById.get(id)?.sortOrder !== sortOrder
    );

    if (hasChanges) {
      const timestamp = this.dependencies.now();

      orderedIds.forEach((id, sortOrder) => {
        const attachment = attachmentsById.get(id);

        if (attachment && attachment.sortOrder !== sortOrder) {
          this.database.attachments.set(id, {
            ...attachment,
            sortOrder,
            updatedAt: timestamp,
          });
        }
      });
    }

    return orderedIds.map((id) =>
      cloneAttachment(this.database.attachments.get(id)!)
    );
  }

  async softDelete(id: UUID) {
    const attachment = this.attachmentOrThrow(id);
    this.activeEventOrThrow(attachment.eventId);

    if (attachment.deletedAt !== null) return;

    const timestamp = this.dependencies.now();

    this.database.attachments.set(id, {
      ...attachment,
      updatedAt: timestamp,
      deletedAt: timestamp,
    });
  }

  async restore(id: UUID) {
    const attachment = this.attachmentOrThrow(id);
    this.activeEventOrThrow(attachment.eventId);

    if (attachment.deletedAt === null) return;

    const activeAttachments = this.activeAttachmentsForEvent(
      attachment.eventId
    );
    const sortOrder = activeAttachments.length
      ? Math.max(...activeAttachments.map((item) => item.sortOrder)) + 1
      : 0;

    this.database.attachments.set(id, {
      ...attachment,
      sortOrder,
      updatedAt: this.dependencies.now(),
      deletedAt: null,
    });
  }

  private validatedInput(input: CreateAttachmentInput) {
    const relativePath = input.relativePath.trim();
    const filename = input.filename.trim();
    const mimeType = input.mimeType?.trim().toLowerCase() || null;

    if (!relativePath) {
      throw new ModelValidationError(
        'Attachment relative path cannot be empty.'
      );
    }

    if (!filename) {
      throw new ModelValidationError('Attachment filename cannot be empty.');
    }

    this.assertOptionalPositiveInteger(input.width, 'width');
    this.assertOptionalPositiveInteger(input.height, 'height');
    this.assertOptionalNonNegativeInteger(input.fileSize, 'file size');

    return {
      relativePath,
      filename,
      mimeType,
      width: input.width,
      height: input.height,
      fileSize: input.fileSize,
    };
  }

  private assertOptionalPositiveInteger(
    value: number | null,
    fieldName: string
  ) {
    if (value !== null && (!Number.isInteger(value) || value <= 0)) {
      throw new ModelValidationError(
        `Attachment ${fieldName} must be a positive integer or null.`
      );
    }
  }

  private assertOptionalNonNegativeInteger(
    value: number | null,
    fieldName: string
  ) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      throw new ModelValidationError(
        `Attachment ${fieldName} must be a non-negative integer or null.`
      );
    }
  }

  private activeAttachmentsForEvent(eventId: UUID) {
    return [...this.database.attachments.values()]
      .filter(
        (attachment) =>
          attachment.eventId === eventId && attachment.deletedAt === null
      )
      .sort(
        (first, second) =>
          first.sortOrder - second.sortOrder ||
          second.createdAt.localeCompare(first.createdAt) ||
          first.id.localeCompare(second.id)
      );
  }

  private attachmentOrThrow(id: UUID) {
    const attachment = this.database.attachments.get(id);

    if (!attachment) throw new EntityNotFoundError('Attachment', id);

    return attachment;
  }

  private activeEventOrThrow(id: UUID) {
    const event = this.database.events.get(id);

    if (!event || event.deletedAt !== null) {
      throw new EntityNotFoundError('Event', id);
    }

    return event;
  }
}
