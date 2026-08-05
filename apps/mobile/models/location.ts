import type { Timestamp, UUID } from './primitives';

export type Location = {
  id: UUID;
  name: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
};
