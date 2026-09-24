import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { createTestDatabase } from '../../testing/createTestDatabase';
import {
  syncFrontiers,
  syncLocalState,
  syncOperations,
  syncPendingOperations,
  tags,
  events,
  eventAttachments,
} from '../../schema';
import { createOperation } from '../createOperation';
import { applyOperation } from '../applyOperation';
import { applyPendingOperation } from '../pending/applyPendingOperation';
import { createSyncImporter } from './createSyncImporter';
import type { PreparedSyncPackage } from './types';
import type { SyncPackageManifest } from '../export/types';

const at = '2026-09-24T12:00:00.000Z';
let source: Awaited<ReturnType<typeof createTestDatabase>>;
let target: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  source = await createTestDatabase({ initializeSyncState: true });
  target = await createTestDatabase({ initializeSyncState: true });
  target.database.update(syncLocalState).set({ deviceId: 'receiver' }).run();
});
afterEach(() => {
  source.sqlite.close();
  target.sqlite.close();
});

function addSourceTag(id: string) {
  source.database.transaction((tx) =>
    applyOperation(
      createOperation(
        {
          operationType: 'entity.create',
          entityType: 'tag',
          entityId: id,
          payload: { name: id, createdAt: at, updatedAt: at },
        },
        tx
      ),
      tx
    )
  );
}
function packageForSource(): {
  manifest: SyncPackageManifest;
  lines: Uint8Array[];
} {
  const lines = source.database
    .select()
    .from(syncOperations)
    .all()
    .map(({ receivedAt: _r, appliedAt: _a, ...operation }) =>
      utf8ToBytes(`${JSON.stringify(operation)}\n`)
    );
  const bytes = new Uint8Array(
    lines.reduce((sum, line) => sum + line.length, 0)
  );
  let offset = 0;
  for (const line of lines) {
    bytes.set(line, offset);
    offset += line.length;
  }
  return {
    lines,
    manifest: {
      formatVersion: 1,
      operationSchemaVersion: 1,
      packageId: 'package-one',
      createdByDeviceId: 'test-device',
      createdAt: at,
      exporterFrontier: Object.fromEntries(
        source.database
          .select()
          .from(syncFrontiers)
          .all()
          .map((row) => [row.originDeviceId, row.processedSequence])
      ),
      intendedRecipientDeviceId: null,
      baseFrontier: null,
      operations: {
        path: 'operations.jsonl',
        count: lines.length,
        byteLength: bytes.length,
        sha256: bytesToHex(sha256(bytes)),
      },
      blobs: [],
    },
  };
}
function setup(manifest: SyncPackageManifest, lines: Uint8Array[]) {
  const prepared: PreparedSyncPackage = {
    manifest,
    forEachOperationLine: vi.fn((visit) => lines.forEach(visit)),
    repairBlob: vi.fn(async () => 'missing' as const),
    cleanup: vi.fn(),
  };
  const syncImport = createSyncImporter({
    database: target.database,
    storageAccess: {
      withAccess: async (work) => work(),
      requestCleanup: vi.fn(),
    },
    now: () => at,
    openPackage: async () => prepared,
    isBlobAvailable: () => true,
    yieldToApp: async () => {},
  });
  return { prepared, syncImport };
}

it('applies unseen operations, then skips an already-covered package without sealing local pending intent', async () => {
  addSourceTag('source-tag');
  const { manifest, lines } = packageForSource();
  const { syncImport, prepared } = setup(manifest, lines);
  await expect(syncImport('package.lel-package')).resolves.toMatchObject({
    operations: { status: 'processed', applied: 1, alreadyPresent: 0 },
  });
  expect(
    target.database.select().from(tags).where(eq(tags.id, 'source-tag')).get()
      ?.name
  ).toBe('source-tag');
  target.database.transaction((tx) =>
    applyPendingOperation(
      {
        operationType: 'entity.create',
        entityType: 'tag',
        entityId: 'pending-tag',
        payload: { name: 'pending-tag', createdAt: at, updatedAt: at },
      },
      tx
    )
  );
  await expect(syncImport('package.lel-package')).resolves.toMatchObject({
    operations: { status: 'already-covered', applied: 0 },
  });
  expect(
    target.database.select().from(syncPendingOperations).all()
  ).toHaveLength(1);
  expect(prepared.forEachOperationLine).toHaveBeenCalledTimes(1);
});

it('rolls back both sealing and incoming operations when the stream digest fails', async () => {
  addSourceTag('source-tag');
  const { manifest, lines } = packageForSource();
  target.database.transaction((tx) =>
    applyPendingOperation(
      {
        operationType: 'entity.create',
        entityType: 'tag',
        entityId: 'pending-tag',
        payload: { name: 'pending-tag', createdAt: at, updatedAt: at },
      },
      tx
    )
  );
  const { syncImport, prepared } = setup(
    {
      ...manifest,
      operations: { ...manifest.operations, sha256: '0'.repeat(64) },
    },
    lines
  );
  await expect(syncImport('package.lel-package')).rejects.toThrow('manifest');
  expect(target.database.select().from(syncOperations).all()).toHaveLength(0);
  expect(
    target.database.select().from(syncPendingOperations).all()
  ).toHaveLength(1);
  expect(
    target.database.select().from(tags).where(eq(tags.id, 'source-tag')).get()
  ).toBeUndefined();
  expect(prepared.cleanup).toHaveBeenCalledOnce();
});

it('cancels before application without changing history', async () => {
  addSourceTag('source-tag');
  const { manifest, lines } = packageForSource();
  const { syncImport } = setup(manifest, lines);
  const controller = new AbortController();
  await expect(
    syncImport('package.lel-package', {
      signal: controller.signal,
      onProgress(progress) {
        if (progress.phase === 'preparing') controller.abort();
      },
    })
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(target.database.select().from(syncOperations).all()).toHaveLength(0);
});

it('repairs missing live blobs even when all operations are already covered', async () => {
  const hash = 'a'.repeat(64);
  target.database
    .insert(events)
    .values({
      id: 'event',
      title: 'Event',
      date: '2026-09-24',
      time: null,
      significance: 'ordinary',
      categoryId: null,
      locationId: null,
      notes: '',
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    })
    .run();
  target.database
    .insert(eventAttachments)
    .values({
      id: 'image',
      eventId: 'event',
      contentHash: hash,
      filename: 'image.jpg',
      mimeType: 'image/jpeg',
      width: null,
      height: null,
      fileSize: null,
      sortOrder: 0,
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    })
    .run();
  const { manifest, lines } = packageForSource();
  manifest.blobs = [{ contentHash: hash, byteLength: 10 }];
  const prepared: PreparedSyncPackage = {
    manifest,
    forEachOperationLine: vi.fn((visit) => lines.forEach(visit)),
    repairBlob: vi.fn(async () => 'restored' as const),
    cleanup: vi.fn(),
  };
  const syncImport = createSyncImporter({
    database: target.database,
    storageAccess: {
      withAccess: async (work) => work(),
      requestCleanup: vi.fn(),
    },
    now: () => at,
    openPackage: async () => prepared,
    isBlobAvailable: () => false,
    yieldToApp: async () => {},
  });
  await expect(syncImport('package.lel-package')).resolves.toMatchObject({
    operations: { status: 'already-covered' },
    blobs: { restored: 1, stillMissing: 0, failed: 0, cancelled: false },
  });
  expect(prepared.repairBlob).toHaveBeenCalledWith(hash, undefined);
  expect(prepared.forEachOperationLine).not.toHaveBeenCalled();
});
