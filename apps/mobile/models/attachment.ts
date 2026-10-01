import type { Timestamp, UUID } from './primitives';

export type EventAttachment = {
  id: UUID;
  eventId: UUID;

  contentHash: string;
  filename: string;
  mimeType: string | null;

  width: number | null;
  height: number | null;

  fileSize: number | null;
  sortOrder: number;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};
