import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { createTestDatabase } from '../../testing/createTestDatabase';
import {
  syncOperations,
  syncPendingOperations,
  events,
  eventAttachments,
} from '../../schema';
import { applyPendingOperation } from '../pending/applyPendingOperation';
import { sealPendingOperations } from '../pending/sealPendingOperations';
import { createSyncExporter } from './createSyncExporter';
import type { ExportWorkspace, SyncPackageManifest } from './types';

const at = '2026-09-23T12:00:00.000Z';
let fixture: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  fixture = await createTestDatabase({ initializeSyncState: true });
});
afterEach(() => fixture.sqlite.close());
function addTag(id: string) {
  fixture.database.transaction((tx) =>
    applyPendingOperation(
      {
        operationType: 'entity.create',
        entityType: 'tag',
        entityId: id,
        payload: { name: `Voyage é ${id}`, createdAt: at, updatedAt: at },
      },
      tx
    )
  );
}
function setup() {
  const chunks: Uint8Array[] = [];
  let manifest: SyncPackageManifest | undefined;
  let access = false;
  const writer = {
    write: vi.fn((bytes: Uint8Array) => {
      chunks.push(bytes);
    }),
    close: vi.fn(),
  };
  const workspace: ExportWorkspace = {
    contentsUri: 'contents',
    partialPackageUri: 'partial',
    openOperations: () => writer,
    copyBlob: vi.fn(() => {
      expect(access).toBe(true);
      return 10;
    }),
    writeManifest: vi.fn((value) => {
      manifest = value;
    }),
    finalize: vi.fn(() => 'completed.lel-package'),
    cleanup: vi.fn(),
  };
  const compressPackage = vi.fn(async () => {
    expect(access).toBe(false);
  });
  const yieldToApp = vi.fn(async () => {});
  const syncExport = createSyncExporter({
    database: fixture.database,
    storageAccess: {
      requestCleanup: vi.fn(),
      withAccess: async (work) => {
        access = true;
        try {
          return await work();
        } finally {
          access = false;
        }
      },
    },
    createId: () => 'package-id',
    now: () => at,
    createWorkspace: () => workspace,
    compressPackage,
    yieldToApp,
    chunkSize: 1,
  });
  return {
    syncExport,
    workspace,
    writer,
    compressPackage,
    yieldToApp,
    manifest: () => manifest!,
    text: () => chunks.map((bytes) => new TextDecoder().decode(bytes)).join(''),
  };
}

it('seals pending changes, pages immutable content, and hashes exact UTF-8 bytes', async () => {
  addTag('a');
  addTag('b');
  const test = setup();
  await expect(test.syncExport()).resolves.toMatchObject({
    operationCount: 2,
    blobCount: 0,
    uri: 'completed.lel-package',
  });
  const operations = test
    .text()
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  expect(operations.map((row) => row.originSequence)).toEqual([1, 2]);
  for (const row of operations) {
    expect(row).not.toHaveProperty('receivedAt');
    expect(row).not.toHaveProperty('appliedAt');
  }
  expect(test.manifest().operations).toEqual({
    path: 'operations.jsonl',
    count: 2,
    byteLength: utf8ToBytes(test.text()).length,
    sha256: bytesToHex(sha256(utf8ToBytes(test.text()))),
  });
  expect(fixture.database.select().from(syncPendingOperations).all()).toEqual(
    []
  );
  expect(test.writer.close).toHaveBeenCalledOnce();
  expect(test.workspace.cleanup).toHaveBeenCalledWith(true);
});

it('excludes history sealed after the snapshot, including a new origin', async () => {
  addTag('a');
  addTag('b');
  const test = setup();
  await test.syncExport({
    onProgress(progress) {
      if (progress.phase === 'operations' && progress.completed === 1) {
        addTag('later');
        fixture.database.transaction((tx) =>
          sealPendingOperations(tx, { now: () => at })
        );
        const row = fixture.database.select().from(syncOperations).all()[0]!;
        fixture.database
          .insert(syncOperations)
          .values({ ...row, originDeviceId: 'new-origin', lamport: 999 })
          .run();
      }
    },
  });
  expect(test.manifest().operations.count).toBe(2);
  expect(test.text()).not.toContain('later');
  expect(test.text()).not.toContain('new-origin');
});

it('cancels between chunks, closes output, cleans artifacts, and preserves sealed history', async () => {
  addTag('a');
  addTag('b');
  const test = setup();
  const controller = new AbortController();
  await expect(
    test.syncExport({
      signal: controller.signal,
      onProgress(p) {
        if (p.phase === 'operations') controller.abort();
      },
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(test.writer.close).toHaveBeenCalledOnce();
  expect(test.workspace.cleanup).toHaveBeenCalledWith(false);
  expect(test.compressPackage).not.toHaveBeenCalled();
  expect(fixture.database.select().from(syncOperations).all()).toHaveLength(2);
});

it('ignores cancellation once compression starts', async () => {
  const test = setup();
  const controller = new AbortController();
  await expect(
    test.syncExport({
      signal: controller.signal,
      onProgress(p) {
        if (p.phase === 'compressing') {
          expect(p.cancellable).toBe(false);
          controller.abort();
        }
      },
    })
  ).resolves.toMatchObject({ operationCount: 0 });
  expect(test.compressPackage).toHaveBeenCalledOnce();
});

it('propagates write and compression errors with cleanup', async () => {
  addTag('a');
  const test = setup();
  test.writer.write.mockImplementationOnce(() => {
    throw new Error('disk full');
  });
  await expect(test.syncExport()).rejects.toThrow('disk full');
  expect(test.writer.close).toHaveBeenCalledOnce();
  expect(test.workspace.cleanup).toHaveBeenCalledWith(false);
  test.compressPackage.mockRejectedValueOnce(new Error('zip failed'));
  await expect(test.syncExport()).rejects.toThrow('zip failed');
});

it('deduplicates live blobs, skips missing files and ignores deleted references', async () => {
  const { database } = fixture;
  const live = 'a'.repeat(64),
    missing = 'b'.repeat(64),
    dead = 'c'.repeat(64);
  database
    .insert(events)
    .values(
      ['active', 'deleted'].map((id) => ({
        id,
        title: id,
        normalizedTitle: id,
        date: '2026-09-23' as const,
        significance: 'ordinary' as const,
        notes: '',
        createdAt: at,
        updatedAt: at,
        deletedAt: id === 'deleted' ? at : null,
      }))
    )
    .run();
  database
    .insert(eventAttachments)
    .values(
      [
        ['1', 'active', live, null],
        ['2', 'active', live, null],
        ['3', 'active', missing, null],
        ['4', 'deleted', dead, null],
        ['5', 'active', dead, at],
      ].map(([id, eventId, contentHash, deletedAt]) => ({
        id: id!,
        eventId: eventId!,
        contentHash: contentHash!,
        deletedAt,
        filename: 'image.jpg',
        mimeType: 'image/jpeg',
        sortOrder: 0,
        createdAt: at,
        updatedAt: at,
      }))
    )
    .run();
  const test = setup();
  vi.mocked(test.workspace.copyBlob).mockImplementation((hash) =>
    hash === missing ? null : 10
  );
  await test.syncExport();
  expect(test.workspace.copyBlob).toHaveBeenCalledTimes(2);
  expect(test.manifest().blobs).toEqual([
    { contentHash: live, byteLength: 10 },
  ]);
});
