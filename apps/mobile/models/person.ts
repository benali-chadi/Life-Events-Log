import type { Timestamp, UUID } from './primitives';

export type Person = {
  id: UUID;
  name: string;
  /** Derived read-model label; never persisted or synced. */
  displayName?: string;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};
