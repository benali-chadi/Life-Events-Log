import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { cancel, listContents, unzip, zip } from 'react-native-zip-archive';
import type {
  ArchiveService,
  ArchiveSource,
  CompressionLevel,
} from './ArchiveService';

// Native cancellation is global. All consumers must use this adapter rather
// than call the library directly. Reject overlapping calls across instances.
let busy = false;

function checkCancellation(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Archive operation cancelled.');
  error.name = 'AbortError';
  throw error;
}

async function exclusive<T>(
  work: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (Platform.OS !== 'android')
    throw new Error('Native ZIP adapter supports Android only.');
  checkCancellation(signal);
  if (busy) throw new Error('An archive operation is already running.');
  busy = true;
  try {
    return await work();
  } finally {
    busy = false;
  }
}

/** Do not use the library's signal wrapper: it rejects before native work ends. */
async function abortable(
  work: () => Promise<unknown>,
  signal?: AbortSignal
): Promise<void> {
  checkCancellation(signal);
  let cancellation: Promise<void> | undefined;
  const onAbort = () => {
    // zip/unzip schedule their native call in a microtask. Schedule cancellation
    // after it, so native startup cannot reset our cancellation request.
    cancellation ??= Promise.resolve()
      .then(() => cancel())
      .catch(() => {
        // If cancellation fails, still wait for the original work to settle.
      });
  };
  const pending = work();
  signal?.addEventListener('abort', onAbort, { once: true });
  if (signal?.aborted) onAbort();
  try {
    await pending;
  } catch (error) {
    checkCancellation(signal);
    throw error;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await cancellation;
  }
  checkCancellation(signal);
}

function safePath(path: string): void {
  if (
    !path ||
    path.startsWith('/') ||
    /^[a-zA-Z]:/.test(path) ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Unsafe archive entry path.');
  }
}

async function entries(uri: string) {
  if (!new File(uri).exists) throw new Error('Archive does not exist.');
  const result = await listContents(uri);
  const names = new Set<string>();
  for (const entry of result) {
    const name = entry.isDirectory ? entry.path.replace(/\/$/, '') : entry.path;
    safePath(name);
    if (names.has(name)) throw new Error('Duplicate archive entry.');
    names.add(name);
    if (
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      entry.isEncrypted
    )
      throw new Error('Unsupported archive entry.');
  }
  return result;
}

/** Android-only, file-based adapter. The library uses source basenames;
 * custom entryPath mappings are rejected, not silently ignored.
 * Failed/cancelled writes can leave partial output owned by the caller.
 */
export class ReactNativeZipArchiveService implements ArchiveService {
  create(
    destinationUri: string,
    sources: readonly ArchiveSource[],
    level: CompressionLevel,
    signal?: AbortSignal
  ): Promise<void> {
    return exclusive(async () => {
      if (new File(destinationUri).exists)
        throw new Error('Archive destination already exists.');
      await this.write(destinationUri, sources, level, new Set(), signal);
    }, signal);
  }

  append(
    archiveUri: string,
    sources: readonly ArchiveSource[],
    level: CompressionLevel,
    signal?: AbortSignal
  ): Promise<void> {
    return exclusive(async () => {
      const existing = await entries(archiveUri);
      await this.write(
        archiveUri,
        sources,
        level,
        new Set(existing.map((entry) => entry.path.replace(/\/$/, ''))),
        signal
      );
    }, signal);
  }

  list(archiveUri: string) {
    return exclusive(async () =>
      (await entries(archiveUri)).map((entry) => ({
        path: entry.path,
        uncompressedSize: entry.size,
      }))
    );
  }

  extract(
    archiveUri: string,
    entryPaths: readonly string[],
    destinationDirectoryUri: string,
    signal?: AbortSignal
  ): Promise<void> {
    return exclusive(async () => {
      const available = await entries(archiveUri);
      for (const path of entryPaths) {
        safePath(path);
        if (
          !available.some((entry) => entry.path === path && !entry.isDirectory)
        )
          throw new Error(`Archive file not found: ${path}`);
      }
      checkCancellation(signal);
      // Never pass an empty selection: some APIs interpret it as extract all.
      if (!entryPaths.length) return;
      await abortable(
        () =>
          unzip(archiveUri, destinationDirectoryUri, {
            entries: [...new Set(entryPaths)],
          }),
        signal
      );
    }, signal);
  }

  private async write(
    uri: string,
    sources: readonly ArchiveSource[],
    level: CompressionLevel,
    names: Set<string>,
    signal?: AbortSignal
  ): Promise<void> {
    if (!Number.isInteger(level) || level < 0 || level > 9)
      throw new Error('Invalid compression level.');
    if (!sources.length)
      throw new Error('At least one source file is required.');
    const destination = new File(uri);
    const paths = sources.map((source) => {
      const file = new File(source.sourceUri);
      if (!file.exists) throw new Error('Archive source file does not exist.');
      if (file.uri === destination.uri)
        throw new Error('Archive cannot include itself.');
      safePath(file.name);
      if (source.entryPath !== undefined && source.entryPath !== file.name)
        throw new Error(
          'Custom archive entry paths are unsupported by this adapter.'
        );
      if (names.has(file.name)) throw new Error('Duplicate archive entry.');
      names.add(file.name);
      return file.uri;
    });
    await abortable(() => zip(paths, uri, level), signal);
  }
}
