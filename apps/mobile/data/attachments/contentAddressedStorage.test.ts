import { beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { digest, CryptoDigestAlgorithm } from 'expo-crypto';

import {
  copyAttachmentIntoStorage,
  migrateLegacyAttachmentFile,
  resolveAttachmentFile,
} from './attachmentStorage';

const state = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  nextId: 0,
}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => `temporary-${state.nextId++}`,
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: vi.fn(async (algorithm: string, bytes: Uint8Array) => {
    if (algorithm !== 'SHA-256')
      throw new Error('Unsupported digest algorithm');
    return Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer;
  }),
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: async () => true,
  shareAsync: async () => undefined,
}));
vi.mock('expo-file-system', () => {
  const path = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = path(parts);
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = path(parts);
    }
    get exists() {
      return state.files.has(this.uri);
    }
    get name() {
      return this.uri.split('/').at(-1);
    }
    copy(destination: File) {
      state.files.set(destination.uri, state.files.get(this.uri)!.slice());
    }
    move(destination: File) {
      this.copy(destination);
      this.delete();
      this.uri = destination.uri;
    }
    delete() {
      state.files.delete(this.uri);
    }
    async bytes() {
      const bytes = state.files.get(this.uri);
      if (!bytes) throw new Error('File not found');
      return bytes.slice();
    }
  }
  return { Directory, File, Paths: { document: 'document', cache: 'cache' } };
});

beforeEach(() => {
  state.files.clear();
  vi.mocked(digest).mockClear();
  state.nextId = 0;
});

it('hashes the entire file natively and reuses the same blob regardless of filename', async () => {
  const bytes = new Uint8Array(1024 * 1024 + 7).fill(42);
  state.files.set('source', bytes);
  const expectedHash = createHash('sha256').update(bytes).digest('hex');
  const first = await copyAttachmentIntoStorage({
    sourceUri: 'source',
    filename: 'a.jpg',
    mimeType: 'image/jpeg',
  });
  const second = await copyAttachmentIntoStorage({
    sourceUri: 'source',
    filename: 'b.png',
    mimeType: 'image/png',
  });
  expect(first).toEqual({
    contentHash: expectedHash,
    uri: `document/attachments/${expectedHash}`,
  });
  expect(second).toEqual(first);
  expect(state.files.get(first.uri)).toEqual(bytes);
  expect([...state.files.keys()]).toEqual(['source', first.uri]);
  expect(digest).toHaveBeenCalledTimes(2);
  expect(digest).toHaveBeenCalledWith(CryptoDigestAlgorithm.SHA256, bytes);
  expect(resolveAttachmentFile(expectedHash)).toEqual({
    uri: first.uri,
    isAvailable: true,
  });
});

it('distinguishes different bytes and handles missing blobs without losing identity', async () => {
  // Identical prefixes must not hide a difference at the end of the file.
  const bytes = new Uint8Array(1024 * 1024 + 7).fill(42);
  state.files.set('a', bytes.slice());
  bytes[bytes.length - 1] = 43;
  state.files.set('b', bytes);
  const a = await copyAttachmentIntoStorage({
    sourceUri: 'a',
    filename: 'same.jpg',
    mimeType: null,
  });
  const b = await copyAttachmentIntoStorage({
    sourceUri: 'b',
    filename: 'same.jpg',
    mimeType: null,
  });
  expect(a.contentHash).not.toBe(b.contentHash);
  state.files.delete(a.uri);
  expect(resolveAttachmentFile(a.contentHash)).toEqual({
    uri: a.uri,
    isAvailable: false,
  });
  expect(resolveAttachmentFile('../private')).toEqual({
    uri: '',
    isAvailable: false,
  });
});

it('cleans up staged content when native hashing fails', async () => {
  state.files.set('source', new Uint8Array([1, 2, 3]));
  vi.mocked(digest).mockRejectedValueOnce(new Error('Hash failed'));
  await expect(
    copyAttachmentIntoStorage({
      sourceUri: 'source',
      filename: 'image.jpg',
      mimeType: 'image/jpeg',
    })
  ).rejects.toThrow('Hash failed');
  expect([...state.files.keys()]).toEqual(['source']);
});

it('reports missing legacy files and preserves existing legacy sources until commit', async () => {
  expect(
    await migrateLegacyAttachmentFile('attachments/missing.jpg')
  ).toBeNull();
  state.files.set('document/attachments/old.jpg', new Uint8Array([1, 2]));
  const hash = await migrateLegacyAttachmentFile('attachments/old.jpg');
  expect(state.files.has('document/attachments/old.jpg')).toBe(true);
  expect(resolveAttachmentFile(hash!).isAvailable).toBe(true);
  await expect(migrateLegacyAttachmentFile('../private')).rejects.toThrow();
});
