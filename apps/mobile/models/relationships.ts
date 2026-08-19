import type { Timestamp, UUID } from './primitives';

export type EventTag = {
  eventId: UUID;
  tagId: UUID;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};

export type EventPerson = {
  eventId: UUID;
  personId: UUID;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};
