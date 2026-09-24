import { beforeEach, expect, it, vi } from 'vitest';
import { unzipSync, strToU8, strFromU8 } from 'fflate';
import { inflateRawSync } from 'node:zlib';
import { compressPackage } from './compressPackage';
import { writeZipArchive } from '../../../compression/zip/writeZipArchive';

const state = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  open: 0,
  maxRead: 0,
  failWrite: false,
}));
vi.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(parent: string | Directory, child?: string) {
      this.uri = `${typeof parent === 'string' ? parent : parent.uri}${child ? `/${child}` : ''}`;
    }
    list() {
      return [...state.files.keys()]
        .filter((path) => path.startsWith(`${this.uri}/`))
        .map((path) => new File(path));
    }
  }
  class File {
    uri: string;
    constructor(parent: string | Directory, child?: string) {
      this.uri = `${typeof parent === 'string' ? parent : parent.uri}${child ? `/${child}` : ''}`;
    }
    get name() {
      return this.uri.split('/').at(-1)!;
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
    open() {
      state.open++;
      let offset = 0;
      let closed = false;
      return {
        readBytes: (size: number) => {
          state.maxRead = Math.max(state.maxRead, size);
          const bytes = state.files.get(this.uri)!.slice(offset, offset + size);
          offset += bytes.length;
          return bytes;
        },
        writeBytes: (bytes: Uint8Array) => {
          if (state.failWrite) throw new Error('disk full');
          const before = state.files.get(this.uri)!;
          const result = new Uint8Array(before.length + bytes.length);
          result.set(before);
          result.set(bytes, before.length);
          state.files.set(this.uri, result);
        },
        close: () => {
          if (!closed) {
            state.open--;
            closed = true;
          }
        },
      };
    }
  }
  return { File, Directory };
});
const args = { sourceDirectory: 'stage', destination: 'partial' };
beforeEach(() => {
  state.files.clear();
  state.open = 0;
  state.maxRead = 0;
  state.failWrite = false;
  state.files.set('stage/manifest.json', strToU8('{"formatVersion":1}'));
  state.files.set('stage/operations.jsonl', new Uint8Array());
});

it('streams JSON and stored blobs into an interoperable ZIP with bounded reads', async () => {
  const name = `blobs/${'a'.repeat(64)}`;
  const blob = new Uint8Array(2_500_000).fill(123);
  state.files.set(`stage/${name}`, blob);
  const yieldToApp = vi.fn(async () => {});
  await compressPackage(args, yieldToApp);
  const archive = state.files.get('partial')!;
  const decoded = unzipSync(archive);
  expect(Object.keys(decoded)).toEqual([
    'manifest.json',
    'operations.jsonl',
    name,
  ]);
  expect(decoded[name]).toEqual(blob);
  expect(decoded['operations.jsonl']).toHaveLength(0);
  expect(state.maxRead).toBe(1024 * 1024);
  expect(yieldToApp).not.toHaveBeenCalled();
  expect(state.open).toBe(0);
  // Independent DEFLATE implementation checks the first entry using central-directory sizes.
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength
  );
  const centralOffset = view.getUint32(archive.length - 6, true);
  const compressedSize = view.getUint32(centralOffset + 20, true);
  const dataOffset = 30 + view.getUint16(26, true) + view.getUint16(28, true);
  expect(view.getUint16(8, true)).toBe(8);
  expect(
    strFromU8(
      inflateRawSync(archive.slice(dataOffset, dataOffset + compressedSize))
    )
  ).toBe('{"formatVersion":1}');
});

it('removes partial output and closes handles after IO or yielding failure', async () => {
  state.failWrite = true;
  await expect(compressPackage(args)).rejects.toThrow('disk full');
  expect(state.files.has('partial')).toBe(false);
  expect(state.open).toBe(0);
  state.failWrite = false;
  state.files.set(
    `stage/blobs/${'b'.repeat(64)}`,
    new Uint8Array(9 * 1024 * 1024)
  );
  await expect(
    compressPackage(args, async () => {
      throw new Error('yield failed');
    })
  ).rejects.toThrow('yield failed');
  expect(state.files.has('partial')).toBe(false);
  expect(state.open).toBe(0);
});

it('never overwrites existing output or archives unexpected paths', async () => {
  state.files.set('partial', strToU8('keep'));
  await expect(compressPackage(args)).rejects.toThrow('already exists');
  expect(strFromU8(state.files.get('partial')!)).toBe('keep');
  state.files.delete('partial');
  state.files.set('stage/blobs/not-a-hash', strToU8('bad'));
  await expect(compressPackage(args)).rejects.toThrow('Unexpected');
  expect(state.files.has('partial')).toBe(false);
});

it('offers a format-independent ZIP writer for other callers', async () => {
  state.files.set('stage/custom.txt', strToU8('hello'));
  await writeZipArchive('generic.zip', [
    {
      name: 'folder/custom.txt',
      sourceUri: 'stage/custom.txt',
      compression: 'deflate',
    },
  ]);
  expect(
    strFromU8(unzipSync(state.files.get('generic.zip')!)['folder/custom.txt']!)
  ).toBe('hello');
  await expect(
    writeZipArchive('unsafe.zip', [
      {
        name: '../outside',
        sourceUri: 'stage/custom.txt',
        compression: 'store',
      },
    ])
  ).rejects.toThrow('Unsafe ZIP entry name');
  expect(state.files.has('unsafe.zip')).toBe(false);
});
