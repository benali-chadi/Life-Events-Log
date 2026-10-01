import { beforeEach, expect, it, vi } from 'vitest';
import { attachmentBlobCleanupStorage } from './blobCleanupStorage';
const state = vi.hoisted(() => ({
  files: new Set<string>(),
  directories: new Set<string>(),
  deleted: [] as string[],
}));
vi.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get exists() {
      return state.files.has(this.uri);
    }
    delete() {
      state.deleted.push(this.uri);
      state.files.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
    get exists() {
      return state.directories.has(this.uri);
    }
    list() {
      return [
        ...[...state.files]
          .filter(
            (path) =>
              path.startsWith(this.uri + '/') &&
              !path.slice(this.uri.length + 1).includes('/')
          )
          .map((path) => new File(path)),
        ...[...state.directories]
          .filter(
            (path) => path !== this.uri && path.startsWith(this.uri + '/')
          )
          .map((path) => new Directory(path)),
      ];
    }
  }
  return { File, Directory, Paths: { document: 'document' } };
});
beforeEach(() => {
  state.files.clear();
  state.directories.clear();
  state.deleted.length = 0;
});
it('only lists immediate hash-named files and never directories or legacy files', () => {
  const hash = 'a'.repeat(64);
  state.directories.add('document/attachments');
  state.directories.add(`document/attachments/${'b'.repeat(64)}`);
  state.files.add(`document/attachments/${hash}`);
  state.files.add('document/attachments/legacy.jpg');
  state.files.add(`document/attachments/nested/${hash}`);
  expect(attachmentBlobCleanupStorage.listBlobs()).toEqual([hash]);
  expect(attachmentBlobCleanupStorage.deleteBlob(hash)).toBe(true);
  expect(attachmentBlobCleanupStorage.deleteBlob(hash)).toBe(false);
  expect(state.deleted).toEqual([`document/attachments/${hash}`]);
  expect(() => attachmentBlobCleanupStorage.deleteBlob('../outside')).toThrow();
});
it('treats an absent attachments directory as empty', () => {
  expect(attachmentBlobCleanupStorage.listBlobs()).toEqual([]);
});
