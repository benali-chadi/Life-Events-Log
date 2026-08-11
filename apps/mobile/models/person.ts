import type { Timestamp, UUID } from './primitives';

export type Person = {
  id: UUID;
  name: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
};
