import { expect, it, vi } from 'vitest';
import { createAttachmentStorageAccess } from './storageAccess';
import { createAttachmentBlobCleanupCoordinator } from '../jobs/attachmentBlobCleanup/coordinator';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const success = { scanned: 0, deleted: 0, failed: 0, cancelled: false };
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

it('coalesces cleanup requests and waits for all concurrent users', async () => {
  const cleanup = {
    startCleanup: vi.fn(async () => success),
    cancelCleanup: vi.fn(async () => undefined),
  };
  const access = createAttachmentStorageAccess(cleanup);
  const a = deferred(),
    b = deferred();
  const first = access.withAccess(() => a.promise);
  const second = access.withAccess(() => b.promise);
  access.requestCleanup();
  access.requestCleanup();
  await tick();
  expect(cleanup.startCleanup).not.toHaveBeenCalled();
  a.resolve();
  await first;
  expect(cleanup.startCleanup).not.toHaveBeenCalled();
  b.resolve();
  await second;
  await tick();
  expect(cleanup.startCleanup).toHaveBeenCalledTimes(1);
});

it('lets immediate access preempt a scheduled cleanup', async () => {
  const cleanup = {
    startCleanup: vi.fn(async () => success),
    cancelCleanup: vi.fn(async () => undefined),
  };
  const access = createAttachmentStorageAccess(cleanup);
  access.requestCleanup();
  await access.withAccess(() =>
    expect(cleanup.startCleanup).not.toHaveBeenCalled()
  );
  await tick();
  expect(cleanup.startCleanup).toHaveBeenCalledTimes(1);
});

it('cancels real cleanup, waits for its exit, and retries after file/reference commit', async () => {
  const hash = 'a'.repeat(64),
    other = 'b'.repeat(64);
  const paused = deferred(),
    release = deferred(),
    finished = deferred();
  const live = new Set<string>();
  const deleted: string[] = [];
  const coordinator = createAttachmentBlobCleanupCoordinator({
    references: { liveContentHashes: () => new Set(live) },
    storage: {
      listBlobs: () => [other, hash],
      deleteBlob: (value) => {
        deleted.push(value);
        return true;
      },
    },
    batchSize: 1,
    yieldToApp: async () => {
      paused.resolve();
      await release.promise;
    },
  });
  let runs = 0;
  const access = createAttachmentStorageAccess({
    ...coordinator,
    startCleanup: async () => {
      const result = await coordinator.startCleanup();
      if (++runs === 2) finished.resolve();
      return result;
    },
  });
  access.requestCleanup();
  await paused.promise;
  const work = vi.fn(() => {
    live.add(hash);
  });
  const importing = access.withAccess(work);
  await tick();
  expect(work).not.toHaveBeenCalled();
  release.resolve();
  await importing;
  await finished.promise;
  expect(deleted).not.toContain(hash);
  expect(work).toHaveBeenCalledTimes(1);
});

it('releases access on synchronous throws and rejected work', async () => {
  for (const work of [
    () => {
      throw new Error('failed');
    },
    () => Promise.reject(new Error('failed')),
  ]) {
    const cleanup = {
      startCleanup: vi.fn(async () => success),
      cancelCleanup: vi.fn(async () => undefined),
    };
    const access = createAttachmentStorageAccess(cleanup);
    await expect(
      access.withAccess(() => {
        access.requestCleanup();
        return work();
      })
    ).rejects.toThrow('failed');
    await tick();
    expect(cleanup.startCleanup).toHaveBeenCalledTimes(1);
    expect(await access.withAccess(() => 42)).toBe(42);
  }
});

it('reports cleanup failure without blocking access or retrying indefinitely', async () => {
  const end = deferred();
  const failure = new Error('IO failed');
  const run = end.promise.then(() => {
    throw failure;
  });
  const cleanup = {
    startCleanup: vi.fn(() => run),
    cancelCleanup: vi.fn(() => run),
  };
  const report = vi.fn();
  const access = createAttachmentStorageAccess(cleanup, report);
  access.requestCleanup();
  await tick();
  const work = access.withAccess(() => 'done');
  end.resolve();
  expect(await work).toBe('done');
  await tick();
  expect(report).toHaveBeenCalledWith(failure);
  expect(cleanup.startCleanup).toHaveBeenCalledTimes(1);
});

it('supports nested access without waiting for other ordinary users', async () => {
  const cleanup = {
    startCleanup: vi.fn(async () => success),
    cancelCleanup: vi.fn(async () => undefined),
  };
  const access = createAttachmentStorageAccess(cleanup);
  expect(await access.withAccess(() => access.withAccess(() => 7))).toBe(7);
});
