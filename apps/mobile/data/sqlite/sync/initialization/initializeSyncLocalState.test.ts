import { expect, it, vi } from 'vitest';
import { createTestDatabase } from '../../testing/createTestDatabase';
import { syncLocalState, syncFrontiers } from '../../schema';
import { initializeSyncLocalState } from './initializeSyncLocalState';

it('initializes once and preserves the replica identity and observed clock', async () => {
  const { sqlite, database } = await createTestDatabase();
  try {
    const generate = vi.fn(() => 'replica');
    initializeSyncLocalState(database, generate);
    expect(database.select().from(syncLocalState).get()).toEqual({
      deviceId: 'replica',
      observedLamport: 0,
    });
    expect(database.select().from(syncFrontiers).all()).toEqual([]);
    database.update(syncLocalState).set({ observedLamport: 42 }).run();
    initializeSyncLocalState(database, generate);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(database.select().from(syncLocalState).get()).toEqual({
      deviceId: 'replica',
      observedLamport: 42,
    });
  } finally {
    sqlite.close();
  }
});
