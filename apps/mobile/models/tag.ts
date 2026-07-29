import type { Timestamp, UUID } from './primitives';

export type Tag = {
  id: UUID;
  name: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};
