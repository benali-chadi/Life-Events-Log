import type { AppDatabase } from '../../database';
import { syncLocalState } from '../../schema';

/** Initialize this database's replica once; never replace its identity or clock. */
export function initializeSyncLocalState(
  database: AppDatabase,
  createDeviceId: () => string
): void {
  database.transaction((tx) => {
    if (tx.select().from(syncLocalState).get()) return;
    tx.insert(syncLocalState)
      .values({ deviceId: createDeviceId(), observedLamport: 0 })
      .run();
  });
}
