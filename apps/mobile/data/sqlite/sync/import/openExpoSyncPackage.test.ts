import { beforeEach, expect, it, vi } from 'vitest';
import { Zip, ZipDeflate, ZipPassThrough, zipSync } from 'fflate';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { openExpoSyncPackage } from './openExpoSyncPackage';
import { openZipArchive } from '../../../compression/zip/openZipArchive';
import type { SyncPackageManifest } from '../export/types';

const state = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  handles: 0,
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'temporary-blob' }));
vi.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(parent: string | Directory, name?: string) {
      this.uri = `${typeof parent === 'string' ? parent : parent.uri}${name ? `/${name}` : ''}`;
    }
    create() {}
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
    create() {
      state.files.set(this.uri, new Uint8Array());
    }
    delete() {
      state.files.delete(this.uri);
    }
    move(destination: File) {
      state.files.set(destination.uri, state.files.get(this.uri)!);
      state.files.delete(this.uri);
    }
    open() {
      state.handles++;
      const uri = this.uri;
      let closed = false;
      return {
        offset: 0,
        readBytes(length: number) {
          const bytes = state.files
            .get(uri)!
            .slice(this.offset, this.offset + length);
          this.offset += bytes.length;
          return bytes;
        },
        writeBytes(bytes: Uint8Array) {
          const before = state.files.get(uri)!;
          const next = new Uint8Array(before.length + bytes.length);
          next.set(before);
          next.set(bytes, before.length);
          state.files.set(uri, next);
        },
        close() {
          if (!closed) {
            closed = true;
            state.handles--;
          }
        },
      };
    }
  }
  return { Directory, File, Paths: { document: 'document', cache: 'cache' } };
});
beforeEach(() => {
  state.files.clear();
  state.handles = 0;
});

it('offers a generic ZIP reader independent of the sync manifest', () => {
  state.files.set(
    'generic.zip',
    zipSync({ 'folder/file.txt': utf8ToBytes('hello') })
  );
  const zip = openZipArchive('generic.zip');
  expect(zip.readText('folder/file.txt', 100)).toBe('hello');
  zip.close();
  expect(state.handles).toBe(0);
});

function packageBytes(
  blob: Uint8Array,
  contentHash = bytesToHex(sha256(blob))
) {
  const line = utf8ToBytes('{"hello":"world"}\n');
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
    blobs: [{ contentHash, byteLength: blob.length }],
  };
  return {
    archive: zipSync({
      'manifest.json': [utf8ToBytes(JSON.stringify(manifest)), { level: 6 }],
      'operations.jsonl': [line, { level: 6 }],
      [`blobs/${contentHash}`]: [blob, { level: 0 }],
    }),
    line,
    contentHash,
  };
}

it('reads the ZIP directory, streams operations, and verifies a needed blob before promotion', async () => {
  const blob = utf8ToBytes('image bytes');
  const { archive, line, contentHash } = packageBytes(blob);
  state.files.set('package.lel-package', archive);
  const prepared = await openExpoSyncPackage('package.lel-package', 'receiver');
  const lines: Uint8Array[] = [];
  prepared.forEachOperationLine((bytes) => lines.push(bytes));
  expect(lines).toEqual([line]);
  expect(await prepared.repairBlob(contentHash)).toBe('restored');
  expect(state.files.get(`document/attachments/${contentHash}`)).toEqual(blob);
  await prepared.cleanup();
  expect(state.handles).toBe(0);
});

it('accepts streaming ZIP entries with data descriptors, like the exporter writes', async () => {
  const blob = utf8ToBytes('image bytes');
  const { line, contentHash } = packageBytes(blob);
  const manifest: SyncPackageManifest = {
    formatVersion: 1,
    operationSchemaVersion: 1,
    packageId: 'streaming-package',
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
    blobs: [{ contentHash, byteLength: blob.length }],
  };
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, bytes) => {
    if (error) throw error;
    chunks.push(bytes);
  });
  const manifestEntry = new ZipDeflate('manifest.json', { level: 6 });
  zip.add(manifestEntry);
  manifestEntry.push(utf8ToBytes(JSON.stringify(manifest)), true);
  const operationsEntry = new ZipDeflate('operations.jsonl', { level: 6 });
  zip.add(operationsEntry);
  operationsEntry.push(line, true);
  const blobEntry = new ZipPassThrough(`blobs/${contentHash}`);
  zip.add(blobEntry);
  blobEntry.push(blob, true);
  zip.end();
  const archive = new Uint8Array(
    chunks.reduce((size, chunk) => size + chunk.length, 0)
  );
  let offset = 0;
  for (const chunk of chunks) {
    archive.set(chunk, offset);
    offset += chunk.length;
  }
  state.files.set('package.lel-package', archive);
  const prepared = await openExpoSyncPackage('package.lel-package', 'receiver');
  const lines: Uint8Array[] = [];
  prepared.forEachOperationLine((bytes) => lines.push(bytes));
  expect(lines).toEqual([line]);
  await prepared.cleanup();
});

it('does not install content whose bytes fail the advertised hash', async () => {
  const advertised = 'a'.repeat(64);
  const { archive } = packageBytes(utf8ToBytes('different'), advertised);
  state.files.set('package.lel-package', archive);
  const prepared = await openExpoSyncPackage('package.lel-package', 'receiver');
  expect(await prepared.repairBlob(advertised)).toBe('failed');
  expect(state.files.has(`document/attachments/${advertised}`)).toBe(false);
  expect(state.files.has('cache/sync-import-blobs/temporary-blob')).toBe(false);
  await prepared.cleanup();
});

it('rejects unexpected archive entries before applying anything', async () => {
  const { archive } = packageBytes(utf8ToBytes('x'));
  // Same package data plus an unlisted path.
  const malicious = zipSync({
    'manifest.json': utf8ToBytes('{}'),
    'operations.jsonl': new Uint8Array(),
    '../outside': archive,
  });
  state.files.set('package.lel-package', malicious);
  await expect(
    openExpoSyncPackage('package.lel-package', 'receiver')
  ).rejects.toThrow('Unsafe ZIP entry name');
  expect(state.handles).toBe(0);
});
