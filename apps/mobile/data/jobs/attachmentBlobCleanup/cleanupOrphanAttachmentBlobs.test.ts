import { expect, it, vi } from 'vitest';
import { cleanupOrphanAttachmentBlobs } from './cleanupOrphanAttachmentBlobs';
import { createAttachmentBlobCleanupCoordinator } from './coordinator';

const a = 'a'.repeat(64),
  b = 'b'.repeat(64),
  c = 'c'.repeat(64);
function setup() {
  return {
    references: {
      liveContentHashes: vi.fn(() => new Set([a])),
    },
    storage: {
      listBlobs: vi.fn(() => [a, b, c, '../outside', 'legacy.jpg']),
      deleteBlob: vi.fn(() => true),
    },
  };
}
it('keeps shared live hashes and ignores unmanaged names', async () => {
  const options = setup();
  expect(await cleanupOrphanAttachmentBlobs(options)).toEqual({
    scanned: 3,
    deleted: 2,
    failed: 0,
    cancelled: false,
  });
  expect(options.storage.deleteBlob.mock.calls).toEqual([[b], [c]]);
  expect(options.references.liveContentHashes).toHaveBeenCalledTimes(1);
});
it('continues after deletion failure and tolerates files already absent', async () => {
  const options = setup();
  options.storage.deleteBlob
    .mockImplementationOnce(() => {
      throw new Error('IO');
    })
    .mockReturnValueOnce(false);
  expect(await cleanupOrphanAttachmentBlobs(options)).toMatchObject({
    deleted: 0,
    failed: 1,
  });
  expect(options.storage.deleteBlob).toHaveBeenCalledTimes(2);
});
it('does not delete when initial DB reads or listing fail', async () => {
  for (const stage of ['database', 'listing'] as const) {
    const options = setup();
    const fail = () => {
      throw new Error('Unavailable');
    };
    if (stage === 'database')
      options.references.liveContentHashes.mockImplementation(fail);
    else options.storage.listBlobs.mockImplementation(fail);
    await expect(cleanupOrphanAttachmentBlobs(options)).rejects.toThrow(
      'Unavailable'
    );
    expect(options.storage.deleteBlob).not.toHaveBeenCalled();
  }
});
it('supports cancellation before starting and between batches', async () => {
  const options = setup();
  const controller = new AbortController();
  controller.abort();
  expect(
    await cleanupOrphanAttachmentBlobs({
      ...options,
      signal: controller.signal,
    })
  ).toMatchObject({ scanned: 0, cancelled: true });
  expect(options.storage.listBlobs).not.toHaveBeenCalled();
  const next = new AbortController();
  expect(
    await cleanupOrphanAttachmentBlobs({
      ...options,
      signal: next.signal,
      batchSize: 2,
      yieldToApp: async () => next.abort(),
    })
  ).toMatchObject({ scanned: 2, deleted: 1, cancelled: true });
});
it('shares one running job, waits for cancellation, and allows a fresh run', async () => {
  const options = setup();
  let release!: () => void;
  let paused!: () => void;
  const reached = new Promise<void>((resolve) => {
    paused = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const coordinator = createAttachmentBlobCleanupCoordinator({
    ...options,
    batchSize: 1,
    yieldToApp: async () => {
      paused();
      await gate;
    },
  });
  const first = coordinator.startCleanup();
  expect(coordinator.startCleanup()).toBe(first);
  await reached;
  const cancellation = coordinator.cancelCleanup();
  release();
  expect(await cancellation).toMatchObject({ cancelled: true, deleted: 0 });
  expect(await coordinator.startCleanup()).toMatchObject({
    cancelled: false,
    deleted: 2,
  });
});
it('releases coordinator state after failure', async () => {
  const options = setup();
  options.storage.listBlobs.mockImplementationOnce(() => {
    throw new Error('Unavailable');
  });
  const coordinator = createAttachmentBlobCleanupCoordinator(options);
  await expect(coordinator.startCleanup()).rejects.toThrow('Unavailable');
  expect(await coordinator.startCleanup()).toMatchObject({ deleted: 2 });
});
