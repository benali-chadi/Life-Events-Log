import { randomUUID } from 'expo-crypto';
import { createInMemoryRepositories, DEVELOPMENT_SEED } from './in-memory';

export const appRepositories = createInMemoryRepositories({
  seed: DEVELOPMENT_SEED,
  dependencies: {
    createId: randomUUID,
    now: () => new Date().toISOString(),
  },
});
