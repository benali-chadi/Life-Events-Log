import { cleanupOrphanAttachmentBlobs } from './cleanupOrphanAttachmentBlobs';
import type { CleanupOptions, CleanupResult } from './types';

/** Own one instance per app database. This only prevents overlapping cleanups;
 * coordination with imports/exports must be added before wiring app triggers.
 */
export function createAttachmentBlobCleanupCoordinator(
  options: Omit<CleanupOptions, 'signal'>
) {
  let controller: AbortController | undefined;
  let running: Promise<CleanupResult> | undefined;
  return {
    startCleanup(): Promise<CleanupResult> {
      if (running) return running;
      const current = new AbortController();
      controller = current;
      // Schedule after storing the run so immediate cancellation also works.
      running = Promise.resolve()
        .then(() =>
          cleanupOrphanAttachmentBlobs({ ...options, signal: current.signal })
        )
        .finally(() => {
          controller = undefined;
          running = undefined;
        });
      return running;
    },
    async cancelCleanup(): Promise<CleanupResult | undefined> {
      controller?.abort();
      return await running;
    },
  };
}
