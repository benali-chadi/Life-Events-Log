import { and, desc, eq, inArray, isNull, max } from 'drizzle-orm';
import {
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  type AttachmentRepository,
  type CreateAttachmentInput,
  type RepositoryDependencies,
} from '@/data/repositories';
import type { EventAttachment, UUID } from '@/models';
import type { AppDatabase } from '../database';
import { eventAttachments, events } from '../schema';
import { applyPendingOperation } from '../sync/pending/applyPendingOperation';

export class SQLiteAttachmentRepository implements AttachmentRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async getById(id: UUID): Promise<EventAttachment | null> {
    return (
      this.database
        .select()
        .from(eventAttachments)
        .where(
          and(eq(eventAttachments.id, id), isNull(eventAttachments.deletedAt))
        )
        .get() ?? null
    );
  }

  async listForEvent(eventId: UUID): Promise<EventAttachment[]> {
    this.activeEventOrThrow(eventId);

    return this.activeAttachmentsForEvent(eventId);
  }

  async create(input: CreateAttachmentInput): Promise<EventAttachment> {
    this.activeEventOrThrow(input.eventId);
    const values = this.validatedInput(input);
    const id = this.dependencies.createId();

    const existing = this.database
      .select({ id: eventAttachments.id })
      .from(eventAttachments)
      .where(eq(eventAttachments.id, id))
      .get();

    if (existing) {
      throw new RepositoryError(
        `Generated duplicate attachment ID “${id}”. No attachment was created.`
      );
    }

    const highestSortOrder = this.database
      .select({ value: max(eventAttachments.sortOrder) })
      .from(eventAttachments)
      .where(
        and(
          eq(eventAttachments.eventId, input.eventId),
          isNull(eventAttachments.deletedAt)
        )
      )
      .get()?.value;
    const timestamp = this.dependencies.now();
    const attachment: EventAttachment = {
      id,
      eventId: input.eventId,
      ...values,
      sortOrder:
        highestSortOrder === null || highestSortOrder === undefined
          ? 0
          : highestSortOrder + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    this.database.transaction((tx) => {
      const { id: entityId, deletedAt: _deletedAt, ...payload } = attachment;
      applyPendingOperation(
        {
          operationType: 'attachment.create',
          entityType: 'attachment',
          entityId,
          payload,
        },
        tx
      );
    });

    return (await this.getById(id))!;
  }

  async reorder(
    eventId: UUID,
    attachmentIds: readonly UUID[]
  ): Promise<EventAttachment[]> {
    const orderedIds = [...attachmentIds];

    return this.database.transaction((transaction) => {
      this.activeEventOrThrow(eventId, transaction);
      const activeAttachments = this.activeAttachmentsForEvent(
        eventId,
        transaction
      );

      if (new Set(orderedIds).size !== orderedIds.length) {
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
        const attachment = transaction
          .select()
          .from(eventAttachments)
          .where(eq(eventAttachments.id, id))
          .get();

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

      const timestamp = this.dependencies.now();

      applyPendingOperation(
        {
          operationType: 'event.attachment.reorder',
          entityType: 'event',
          entityId: eventId,
          payload: { orderedAttachmentIds: orderedIds, updatedAt: timestamp },
        },
        transaction
      );
      return this.activeAttachmentsForEvent(eventId, transaction);
    });
  }

  async softDelete(id: UUID): Promise<void> {
    await this.softDeleteMany([id]);
  }

  async softDeleteMany(ids: readonly UUID[]): Promise<void> {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return;

    this.database.transaction((transaction) => {
      const selectedAttachments = transaction
        .select()
        .from(eventAttachments)
        .where(inArray(eventAttachments.id, uniqueIds))
        .all();
      const attachmentsById = new Map(
        selectedAttachments.map((attachment) => [attachment.id, attachment])
      );

      uniqueIds.forEach((id) => {
        if (!attachmentsById.has(id)) {
          throw new EntityNotFoundError('Attachment', id);
        }
      });

      const eventIds = [
        ...new Set(selectedAttachments.map(({ eventId }) => eventId)),
      ];
      const activeEventIds = new Set(
        transaction
          .select({ id: events.id })
          .from(events)
          .where(and(inArray(events.id, eventIds), isNull(events.deletedAt)))
          .all()
          .map((event) => event.id)
      );
      eventIds.forEach((eventId) => {
        if (!activeEventIds.has(eventId)) {
          throw new EntityNotFoundError('Event', eventId);
        }
      });

      const activeIds = selectedAttachments
        .filter((attachment) => attachment.deletedAt === null)
        .map((attachment) => attachment.id);
      if (activeIds.length === 0) return;

      const timestamp = this.dependencies.now();
      for (const id of activeIds) {
        applyPendingOperation(
          {
            operationType: 'attachment.delete',
            entityType: 'attachment',
            entityId: id,
            payload: { deletedAt: timestamp },
          },
          transaction
        );
      }
    });
  }

  async restore(id: UUID): Promise<void> {
    const attachment = this.attachmentOrThrow(id);
    this.activeEventOrThrow(attachment.eventId);

    if (attachment.deletedAt === null) return;

    const highestSortOrder = this.database
      .select({ value: max(eventAttachments.sortOrder) })
      .from(eventAttachments)
      .where(
        and(
          eq(eventAttachments.eventId, attachment.eventId),
          isNull(eventAttachments.deletedAt)
        )
      )
      .get()?.value;

    this.database
      .update(eventAttachments)
      .set({
        sortOrder:
          highestSortOrder === null || highestSortOrder === undefined
            ? 0
            : highestSortOrder + 1,
        updatedAt: this.dependencies.now(),
        deletedAt: null,
      })
      .where(eq(eventAttachments.id, id))
      .run();
  }

  private validatedInput(input: CreateAttachmentInput) {
    const contentHash = input.contentHash.trim();
    const filename = input.filename.trim();
    const mimeType = input.mimeType?.trim().toLowerCase() || null;

    if (!/^[0-9a-f]{64}$/.test(contentHash)) {
      throw new ModelValidationError(
        'Attachment content hash must be a lowercase SHA-256 digest.'
      );
    }
    if (!filename) {
      throw new ModelValidationError('Attachment filename cannot be empty.');
    }

    this.assertOptionalPositiveInteger(input.width, 'width');
    this.assertOptionalPositiveInteger(input.height, 'height');
    this.assertOptionalNonNegativeInteger(input.fileSize, 'file size');

    return {
      contentHash,
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

  private activeAttachmentsForEvent(
    eventId: UUID,
    database: Pick<AppDatabase, 'select'> = this.database
  ) {
    return database
      .select()
      .from(eventAttachments)
      .where(
        and(
          eq(eventAttachments.eventId, eventId),
          isNull(eventAttachments.deletedAt)
        )
      )
      .orderBy(
        eventAttachments.sortOrder,
        desc(eventAttachments.createdAt),
        eventAttachments.id
      )
      .all();
  }

  private attachmentOrThrow(id: UUID) {
    const attachment = this.database
      .select()
      .from(eventAttachments)
      .where(eq(eventAttachments.id, id))
      .get();

    if (!attachment) throw new EntityNotFoundError('Attachment', id);

    return attachment;
  }

  private activeEventOrThrow(
    id: UUID,
    database: Pick<AppDatabase, 'select'> = this.database
  ) {
    const event = database
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.id, id), isNull(events.deletedAt)))
      .get();

    if (!event) throw new EntityNotFoundError('Event', id);
  }
}
