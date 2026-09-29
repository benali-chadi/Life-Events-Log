import { beforeEach, expect, it, vi } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { openExpoSyncPackage } from './openExpoSyncPackage';
import { forEachOperationLine } from './readOperationLines';
import { fixLiveAttachmentBlobs } from './fixLiveAttachmentBlobs';
import type { ArchiveService } from '../../../compression/ArchiveService';
import type { SyncPackageManifest } from '../export/types';
import { MAX_MANIFEST_BYTES } from '../packageLimits';

const state = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  dirs: new Set<string>(),
  handles: 0,
}));
vi.mock('expo-sharing', () => ({}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => 'workspace',
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: vi.fn(
    async (_algorithm: string, bytes: Uint8Array) => sha256(bytes).buffer
  ),
}));
vi.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(parent: string | Directory, name?: string) {
      this.uri = `${typeof parent === 'string' ? parent : parent.uri}${name ? `/${name}` : ''}`;
    }
    get exists() {
      return state.dirs.has(this.uri);
    }
    create() {
      state.dirs.add(this.uri);
    }
    delete() {
      for (const path of state.files.keys())
        if (path.startsWith(`${this.uri}/`)) state.files.delete(path);
      for (const path of state.dirs)
        if (path === this.uri || path.startsWith(`${this.uri}/`))
          state.dirs.delete(path);
    }
  }
  class File {
    uri: string;
    constructor(parent: string | Directory, name?: string) {
      this.uri = `${typeof parent === 'string' ? parent : parent.uri}${name ? `/${name}` : ''}`;
    }
    get exists() {
      return state.files.has(this.uri);
    }
    get size() {
      return state.files.get(this.uri)?.length ?? 0;
    }
    textSync() {
      return new TextDecoder().decode(state.files.get(this.uri));
    }
    async bytes() {
      return state.files.get(this.uri)!.slice();
    }
    delete() {
      state.files.delete(this.uri);
    }
    move(destination: File) {
      state.files.set(destination.uri, state.files.get(this.uri)!);
      state.files.delete(this.uri);
      this.uri = destination.uri;
    }
    open() {
      state.handles++;
      const uri = this.uri;
      return {
        offset: 0,
        readBytes(length: number) {
          const bytes = state.files
            .get(uri)!
            .slice(this.offset, this.offset + length);
          this.offset += bytes.length;
          return bytes;
        },
        close() {
          state.handles--;
        },
      };
    }
  }
  return { Directory, File, Paths: { document: 'document', cache: 'cache' } };
});

beforeEach(() => {
  vi.clearAllMocks();
  state.files.clear();
  state.dirs.clear();
  state.handles = 0;
});

function fixture(count = 1) {
  const line = utf8ToBytes('{"hello":"world"}\n');
  const blobs = Array.from({ length: count }, (_, index) =>
    utf8ToBytes(`image ${index}`)
  );
  const hashes = blobs.map((blob) => bytesToHex(sha256(blob)));
  const manifest: SyncPackageManifest = {
    formatVersion: 1,
    operationSchemaVersion: 1,
    packageId: 'package-id',
    createdByDeviceId: 'sender',
    createdAt: '2026-09-24T12:00:00.000Z',
    exporterFrontier: { sender: 1 },
    intendedRecipientDeviceId: null,
    baseFrontier: null,
    operations: {
      path: 'operations.jsonl',
      count: 1,
      byteLength: line.length,
      sha256: bytesToHex(sha256(line)),
    },
    blobs: hashes.map((contentHash, i) => ({
      contentHash,
      byteLength: blobs[i]!.length,
    })),
  };
  const files = new Map<string, Uint8Array>([
    ['manifest.json', utf8ToBytes(JSON.stringify(manifest))],
    ['operations.jsonl', line],
    ...hashes.map((hash, i): [string, Uint8Array] => [hash, blobs[i]!]),
  ]);
  const extract = vi.fn<ArchiveService['extract']>(
    async (_uri, paths, destination) => {
      for (const path of paths)
        state.files.set(`${destination}/${path}`, files.get(path)!.slice());
    }
  );
  const archive: ArchiveService = {
    create: vi.fn(),
    append: vi.fn(),
    extract,
    list: vi.fn(async () =>
      [...files].map(([path, bytes]) => ({
        path,
        uncompressedSize: bytes.length,
      }))
    ),
  };
  return { archive, files, hashes, blobs, manifest, line, extract };
}

it('extracts manifest first, prepares operations lazily, and promotes verified flat blobs', async () => {
  const { archive, hashes, blobs, line, extract } = fixture();
  const prepared = await openExpoSyncPackage('package', 'receiver', archive);
  expect(extract).toHaveBeenCalledTimes(1);
  expect(extract.mock.calls[0]![1]).toEqual(['manifest.json']);
  await prepared.prepareOperations();
  const lines: Uint8Array[] = [];
  prepared.forEachOperationLine((bytes) => lines.push(bytes));
  expect(lines).toEqual([line]);
  await prepared.prepareBlobBatch(hashes);
  expect(await prepared.repairBlob(hashes[0]!)).toBe('restored');
  expect(state.files.get(`document/attachments/${hashes[0]}`)).toEqual(
    blobs[0]
  );
  await prepared.cleanup();
  expect([...state.files.keys()]).toEqual([
    `document/attachments/${hashes[0]}`,
  ]);
  expect(state.handles).toBe(0);
});

it('rejects bad hashes and sizes independently without blocking a good blob', async () => {
  const { archive, hashes, files } = fixture(3);
  const prepared = await openExpoSyncPackage('package', 'receiver', archive);
  files.set(hashes[0]!, utf8ToBytes('wrong!!')); // same length, incorrect digest
  files.set(hashes[1]!, new Uint8Array(1));
  const result = await fixLiveAttachmentBlobs(
    hashes,
    prepared,
    {},
    async () => {}
  );
  expect(result).toEqual({
    restored: 1,
    failed: 2,
    stillMissing: 0,
    cancelled: false,
  });
  await prepared.cleanup();
  expect([...state.files.keys()]).toEqual([
    `document/attachments/${hashes[2]}`,
  ]);
  expect(state.handles).toBe(0);
});

it('discards a partially extracted failed batch and proceeds to the next batch', async () => {
  const { archive, hashes, extract, files } = fixture(17);
  const prepared = await openExpoSyncPackage('package', 'receiver', archive);
  extract.mockImplementationOnce(async (_uri, paths, destination) => {
    state.files.set(`${destination}/${paths[0]}`, files.get(paths[0]!)!);
    throw new Error('Extraction failed');
  });
  const result = await fixLiveAttachmentBlobs(
    [...hashes, 'f'.repeat(64)],
    prepared,
    {},
    async () => {}
  );
  expect(result).toEqual({
    restored: 1,
    failed: 16,
    stillMissing: 1,
    cancelled: false,
  });
  expect(extract.mock.calls.slice(1).map((call) => call[1].length)).toEqual([
    16, 1,
  ]);
  await prepared.cleanup();
  expect([...state.files.keys()]).toEqual([
    `document/attachments/${hashes[16]}`,
  ]);
});

it('stops on extraction cancellation instead of advancing to the next batch', async () => {
  const { archive, hashes, extract } = fixture(17);
  const prepared = await openExpoSyncPackage('package', 'receiver', archive);
  const controller = new AbortController();
  extract.mockImplementationOnce(async () => {
    controller.abort();
    throw new Error('Native cancellation');
  });
  const result = await fixLiveAttachmentBlobs(
    hashes,
    prepared,
    { signal: controller.signal },
    async () => {}
  );
  expect(result).toEqual({
    restored: 0,
    failed: 0,
    stillMissing: 0,
    cancelled: true,
  });
  expect(extract).toHaveBeenCalledTimes(2);
  await prepared.cleanup();
  expect(state.files.size).toBe(0);
});

it.each(['../outside', 'blobs/' + 'a'.repeat(64)])(
  'rejects unexpected entry %s before extraction',
  async (path) => {
    const { archive, files, extract } = fixture();
    files.set(path, new Uint8Array());
    await expect(
      openExpoSyncPackage('package', 'receiver', archive)
    ).rejects.toThrow('Unexpected');
    expect(extract).not.toHaveBeenCalled();
    expect(state.dirs.size).toBe(0);
  }
);

it('rejects an oversized manifest before extraction', async () => {
  const { archive, extract } = fixture();
  archive.list = async () => [
    { path: 'manifest.json', uncompressedSize: MAX_MANIFEST_BYTES + 1 },
    { path: 'operations.jsonl', uncompressedSize: 0 },
  ];
  await expect(
    openExpoSyncPackage('package', 'receiver', archive)
  ).rejects.toThrow('Manifest exceeds');
  expect(extract).not.toHaveBeenCalled();
});

it('uses the byte target as well as file count, allowing oversized singleton batches', async () => {
  const { archive, hashes } = fixture(4);
  const prepared = await openExpoSyncPackage('package', 'receiver', archive);
  const sizes = [40, 30, 100, 1];
  prepared.manifest.blobs.forEach((blob, i) => {
    blob.byteLength = sizes[i]! * 1024 * 1024;
  });
  prepared.prepareBlobBatch = vi.fn(async () => {});
  prepared.repairBlob = vi.fn(async () => 'restored' as const);
  const result = await fixLiveAttachmentBlobs(
    hashes,
    prepared,
    {},
    async () => {}
  );
  expect(result.restored).toBe(4);
  expect(
    vi.mocked(prepared.prepareBlobBatch).mock.calls.map((call) => call[0])
  ).toEqual(hashes.map((hash) => [hash]));
  await prepared.cleanup();
});

it('waits for an in-progress native hash before observing cancellation', async () => {
  const { archive, hashes, blobs } = fixture(2);
  const prepared = await openExpoSyncPackage('package', 'receiver', archive);
  const controller = new AbortController();
  let finishHash!: (digest: ArrayBuffer) => void;
  vi.mocked(Crypto.digest).mockImplementationOnce(
    () =>
      new Promise<ArrayBuffer>((resolve) => {
        finishHash = resolve;
      })
  );
  let settled = false;
  const repair = fixLiveAttachmentBlobs(
    hashes,
    prepared,
    { signal: controller.signal },
    async () => {}
  ).then((result) => {
    settled = true;
    return result;
  });
  await vi.waitFor(() => expect(Crypto.digest).toHaveBeenCalledTimes(1));
  controller.abort();
  await Promise.resolve();
  expect(settled).toBe(false);
  finishHash(new Uint8Array(sha256(blobs[0]!)).buffer);
  expect(await repair).toEqual({
    restored: 0,
    failed: 0,
    stillMissing: 0,
    cancelled: true,
  });
  expect(Crypto.digest).toHaveBeenCalledTimes(1);
  await prepared.cleanup();
  expect(state.files.size).toBe(0);
});

it('keeps already promoted blobs when repair is stopped between files', async () => {
  const { archive, hashes } = fixture(2);
  const prepared = await openExpoSyncPackage('package', 'receiver', archive);
  const controller = new AbortController();
  const result = await fixLiveAttachmentBlobs(
    hashes,
    prepared,
    { signal: controller.signal },
    async () => {
      controller.abort();
    }
  );
  expect(result).toEqual({
    restored: 1,
    failed: 0,
    stillMissing: 0,
    cancelled: true,
  });
  await prepared.cleanup();
  expect([...state.files.keys()]).toEqual([
    `document/attachments/${hashes[0]}`,
  ]);
});

it('does not impose a ZIP32 ceiling on declared operation or blob sizes', async () => {
  const { archive, manifest, files, hashes } = fixture();
  manifest.operations.byteLength = 2 ** 32 + 10;
  manifest.blobs[0]!.byteLength = 2 ** 32 + 20;
  const manifestBytes = utf8ToBytes(JSON.stringify(manifest));
  files.set('manifest.json', manifestBytes);
  archive.list = async () => [
    { path: 'manifest.json', uncompressedSize: manifestBytes.length },
    {
      path: 'operations.jsonl',
      uncompressedSize: manifest.operations.byteLength,
    },
    { path: hashes[0]!, uncompressedSize: manifest.blobs[0]!.byteLength },
  ];
  const prepared = await openExpoSyncPackage('package', 'receiver', archive);
  expect(prepared.manifest.operations.byteLength).toBeGreaterThan(2 ** 32);
  await prepared.cleanup();
});

it('rejects an inventory mismatch and removes extracted manifest output', async () => {
  const { archive, files, hashes } = fixture();
  files.delete(hashes[0]!);
  await expect(
    openExpoSyncPackage('package', 'receiver', archive)
  ).rejects.toThrow('Archive entries');
  expect(state.files.size).toBe(0);
});

it('checks actual operations size after extraction', async () => {
  const { archive, files } = fixture();
  const prepared = await openExpoSyncPackage('package', 'receiver', archive);
  files.set('operations.jsonl', new Uint8Array());
  await expect(prepared.prepareOperations()).rejects.toThrow('length');
  await prepared.cleanup();
  expect(state.files.size).toBe(0);
});

it('reads lines across chunk boundaries and enforces line limits and final newlines', () => {
  const bytes = utf8ToBytes('a'.repeat(1024 * 1024) + '\nnext\n');
  state.files.set('operations', bytes);
  const file = new File('operations');
  const lines: Uint8Array[] = [];
  forEachOperationLine(file, bytes.length, (line) => lines.push(line));
  expect(lines.map((line) => line.length)).toEqual([1024 * 1024 + 1, 5]);
  expect(() => forEachOperationLine(file, 100, () => {})).toThrow('too large');
  state.files.set('operations', utf8ToBytes('no newline'));
  expect(() => forEachOperationLine(file, 100, () => {})).toThrow(
    'final newline'
  );
  expect(state.handles).toBe(0);
});
