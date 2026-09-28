import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ReactNativeZipArchiveService } from './ReactNativeZipArchiveService';

const mocks = vi.hoisted(() => ({
  files: new Set<string>(),
  zip: vi.fn(),
  unzip: vi.fn(),
  cancel: vi.fn(),
  listContents: vi.fn(),
  platform: { OS: 'android' },
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('react-native-zip-archive', () => mocks);
vi.mock('expo-file-system', () => ({
  File: class {
    constructor(public uri: string) {}
    get exists() {
      return mocks.files.has(this.uri);
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
  },
}));

const source = { sourceUri: 'file:///attachments/hash' };
const archive = 'file:///package.zip';
const entry = (path: string) => ({
  path,
  size: 10,
  compressedSize: 10,
  isDirectory: false,
  isEncrypted: false,
});
const service = new ReactNativeZipArchiveService();

beforeEach(() => {
  vi.resetAllMocks();
  mocks.files.clear();
  mocks.files.add(source.sourceUri);
  mocks.platform.OS = 'android';
  mocks.zip.mockResolvedValue(archive);
  mocks.unzip.mockResolvedValue('file:///out');
  mocks.cancel.mockResolvedValue(undefined);
  mocks.listContents.mockResolvedValue([]);
});

describe('ReactNativeZipArchiveService', () => {
  it('creates directly from original sources with a numeric compression level', async () => {
    await service.create(archive, [source], 6);
    expect(mocks.zip).toHaveBeenCalledWith([source.sourceUri], archive, 6);
  });

  it('appends after checking existing entries', async () => {
    mocks.files.add(archive);
    mocks.listContents.mockResolvedValue([entry('manifest.json')]);
    await service.append(archive, [source], 0);
    expect(mocks.zip).toHaveBeenCalledWith([source.sourceUri], archive, 0);
  });

  it('rejects existing create destinations and missing append archives', async () => {
    await expect(service.append(archive, [source], 0)).rejects.toThrow(
      'does not exist'
    );
    mocks.files.add(archive);
    await expect(service.create(archive, [source], 6)).rejects.toThrow(
      'already exists'
    );
    expect(mocks.zip).not.toHaveBeenCalled();
  });

  it('rejects duplicate sources and collisions during append', async () => {
    await expect(service.create(archive, [source, source], 0)).rejects.toThrow(
      'Duplicate'
    );
    mocks.files.add(archive);
    mocks.listContents.mockResolvedValue([entry('hash')]);
    await expect(service.append(archive, [source], 0)).rejects.toThrow(
      'Duplicate'
    );
    expect(mocks.zip).not.toHaveBeenCalled();
  });

  it('rejects custom paths but accepts an explicit basename', async () => {
    await expect(
      service.create(archive, [{ ...source, entryPath: 'blobs/hash' }], 0)
    ).rejects.toThrow('Custom');
    await service.create(archive, [{ ...source, entryPath: 'hash' }], 0);
    expect(mocks.zip).toHaveBeenCalledTimes(1);
  });

  it('lists metadata and extracts only requested files without passing a signal to the library', async () => {
    mocks.files.add(archive);
    mocks.listContents.mockResolvedValue([
      entry('hash'),
      entry('manifest.json'),
    ]);
    expect(await service.list(archive)).toEqual([
      { path: 'hash', uncompressedSize: 10 },
      { path: 'manifest.json', uncompressedSize: 10 },
    ]);
    await service.extract(
      archive,
      ['hash'],
      'file:///out',
      new AbortController().signal
    );
    expect(mocks.unzip).toHaveBeenCalledWith(archive, 'file:///out', {
      entries: ['hash'],
    });
  });

  it('rejects missing selections and unsafe/duplicate archive entries', async () => {
    mocks.files.add(archive);
    await expect(
      service.extract(archive, ['missing'], 'file:///out')
    ).rejects.toThrow('not found');
    mocks.listContents.mockResolvedValue([entry('../bad')]);
    await expect(service.list(archive)).rejects.toThrow('Unsafe');
    mocks.listContents.mockResolvedValue([entry('hash'), entry('hash')]);
    await expect(service.list(archive)).rejects.toThrow('Duplicate');
    expect(mocks.unzip).not.toHaveBeenCalled();
  });

  it('does not turn an empty selection into extract-all', async () => {
    mocks.files.add(archive);
    await service.extract(archive, [], 'file:///out');
    expect(mocks.unzip).not.toHaveBeenCalled();
  });

  it('rejects pre-cancelled calls before native work', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.create(archive, [source], 0, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.zip).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'waits for original work after cancellation (cancel fails: %s)',
    async (cancelFails) => {
      let finish!: () => void;
      mocks.zip.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          })
      );
      if (cancelFails)
        mocks.cancel.mockRejectedValue(new Error('cancel failed'));
      const controller = new AbortController();
      let settled = false;
      const result = service.create(archive, [source], 0, controller.signal);
      const assertion = expect(result).rejects.toMatchObject({
        name: 'AbortError',
      });
      void result.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        }
      );
      controller.abort();
      await vi.waitFor(() => expect(mocks.cancel).toHaveBeenCalledTimes(1));
      expect(settled).toBe(false);
      await expect(
        new ReactNativeZipArchiveService().list(archive)
      ).rejects.toThrow('already running');
      finish();
      await assertion;
      mocks.zip.mockResolvedValue(archive);
      await service.create(archive, [source], 0);
    }
  );

  it('releases the lock after native failure', async () => {
    mocks.zip.mockRejectedValueOnce(new Error('native failure'));
    await expect(service.create(archive, [source], 6)).rejects.toThrow(
      'native failure'
    );
    await expect(service.create(archive, [source], 6)).resolves.toBeUndefined();
  });

  it('rejects unsupported platforms', async () => {
    mocks.platform.OS = 'ios';
    await expect(service.create(archive, [source], 6)).rejects.toThrow(
      'Android only'
    );
  });
});
