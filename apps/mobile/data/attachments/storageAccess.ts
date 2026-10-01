import type { CleanupResult } from '../jobs/attachmentBlobCleanup/types';

export type AttachmentCleanupCoordinator = {
  startCleanup(): Promise<CleanupResult>;
  cancelCleanup(): Promise<CleanupResult | undefined>;
};

export type AttachmentStorageAccess = {
  withAccess<T>(work: () => T | Promise<T>): Promise<T>;
  requestCleanup(): void;
};

/** One shared instance per storage/database pair in a single JS runtime.
 * All blob imports/new references and export reads must participate. This
 * excludes cleanup, not other normal users; it is not a cross-process lock.
 * Callers must cover blob creation through DB commit, not just the file copy.
 */
export function createAttachmentStorageAccess(
  cleanup: AttachmentCleanupCoordinator,
  onCleanupError: (error: unknown) => void = (error) =>
    console.error('Attachment cleanup failed', error)
): AttachmentStorageAccess {
  let activeUsers = 0;
  let requested = false;
  let running: Promise<void> | undefined;

  function tryStartCleanup(): void {
    if (!requested || running || activeUsers > 0) return;
    requested = false;
    // Install the run before invoking injected code, including synchronous throws.
    running = Promise.resolve()
      .then(async () => {
        // Access may have been acquired before this microtask started.
        if (activeUsers > 0) {
          requested = true;
          return;
        }
        try {
          const result = await cleanup.startCleanup();
          if (result.cancelled) requested = true;
        } catch (error) {
          // Failure alone does not request a retry; avoid a busy retry loop.
          try {
            onCleanupError(error);
          } catch {
            /* Reporting must not break coordination. */
          }
        }
      })
      .finally(() => {
        running = undefined;
        tryStartCleanup();
      });
  }

  return {
    async withAccess<T>(work: () => T | Promise<T>): Promise<T> {
      activeUsers++;
      try {
        if (running) {
          // A rejected cancellation promise still means the cleanup has settled
          // for our cleanup coordinator. Wait for bookkeeping before doing work.
          try {
            await cleanup.cancelCleanup();
          } catch {
            /* Reported by the run. */
          }
          await running;
        }
        return await work();
      } finally {
        activeUsers--;
        tryStartCleanup();
      }
    },
    requestCleanup(): void {
      requested = true;
      tryStartCleanup();
    },
  };
}
