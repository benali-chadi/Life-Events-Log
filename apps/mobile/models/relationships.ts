import type { UUID } from './primitives';

export type EventTag = {
  eventId: UUID;
  tagId: UUID;
};

export type EventPerson = {
  eventId: UUID;
  personId: UUID;
};
