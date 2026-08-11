import type { Timestamp, UUID } from '@/models';

export type RepositoryDependencies = {
  createId: () => UUID;
  now: () => Timestamp;
};
