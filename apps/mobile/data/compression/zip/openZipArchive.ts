import { File } from 'expo-file-system';
import { Inflate, strFromU8 } from 'fflate';
import {
  assertSafeZipEntryName,
  ZIP32_LIMIT,
  ZIP32_MAX_ENTRIES,
  ZIP_IO_CHUNK_SIZE,
  ZIP_YIELD_AFTER_BYTES,
  ZipArchiveError,
} from './constants';

export type ZipEntryInfo = {
  name: string;
  method: 'store' | 'deflate';
  compressedSize: number;
  byteLength: number;
  dataOffset: number;
};
export type ZipArchive = {
  entries: ReadonlyMap<string, ZipEntryInfo>;
  readEntry(
    name: string,
    maximumBytes: number,
    write: (bytes: Uint8Array) => void
  ): void;
  readText(name: string, maximumBytes: number): string;
  forEachLine(
    name: string,
    maximumBytes: number,
    maximumLineBytes: number,
    visit: (line: Uint8Array) => void
  ): void;
  copyStoredEntry(
    name: string,
    write: (bytes: Uint8Array) => void,
    signal?: AbortSignal
  ): Promise<void>;
  close(): void;
};

type Handle = ReturnType<File['open']>;

function readAt(handle: Handle, offset: number, length: number): Uint8Array {
  handle.offset = offset;
  const bytes = handle.readBytes(length);
  if (bytes.length !== length)
    throw new ZipArchiveError('Truncated ZIP archive.');
  return bytes;
}
function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
function u16(view: DataView, at: number): number {
  return view.getUint16(at, true);
}
function u32(view: DataView, at: number): number {
  return view.getUint32(at, true);
}
function join(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
function checkCancellation(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('ZIP read cancelled.');
  error.name = 'AbortError';
  throw error;
}

/** Index ZIP32 entries using the central directory for bounded random access. */
function indexZip(handle: Handle, size: number): Map<string, ZipEntryInfo> {
  if (!Number.isSafeInteger(size) || size < 22 || size >= ZIP32_LIMIT)
    throw new ZipArchiveError('Invalid or unsupported ZIP size.');
  const tailOffset = Math.max(0, size - (22 + 0xffff));
  const tail = readAt(handle, tailOffset, size - tailOffset);
  const tailView = viewOf(tail);
  let eocd = -1;
  for (let at = tail.length - 22; at >= 0; at--) {
    if (
      u32(tailView, at) === 0x06054b50 &&
      at + 22 + u16(tailView, at + 20) === tail.length
    ) {
      eocd = at;
      break;
    }
  }
  if (
    eocd < 0 ||
    u16(tailView, eocd + 4) !== 0 ||
    u16(tailView, eocd + 6) !== 0
  )
    throw new ZipArchiveError('Invalid or multi-disk ZIP archive.');
  const count = u16(tailView, eocd + 10);
  const directoryLength = u32(tailView, eocd + 12);
  const directoryOffset = u32(tailView, eocd + 16);
  if (
    count !== u16(tailView, eocd + 8) ||
    count >= ZIP32_MAX_ENTRIES ||
    directoryLength > 16 * 1024 * 1024 ||
    directoryOffset + directoryLength > tailOffset + eocd
  )
    throw new ZipArchiveError('Invalid or unsupported ZIP directory.');
  const bytes = readAt(handle, directoryOffset, directoryLength);
  const view = viewOf(bytes);
  const entries = new Map<string, ZipEntryInfo>();
  let at = 0;
  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.length || u32(view, at) !== 0x02014b50)
      throw new ZipArchiveError('Invalid ZIP entry.');
    const flags = u16(view, at + 8);
    const method = u16(view, at + 10);
    const compressedSize = u32(view, at + 20);
    const byteLength = u32(view, at + 24);
    const nameLength = u16(view, at + 28);
    const extraLength = u16(view, at + 30);
    const commentLength = u16(view, at + 32);
    const localOffset = u32(view, at + 42);
    const next = at + 46 + nameLength + extraLength + commentLength;
    if (
      next > bytes.length ||
      (flags & ~0x808) !== 0 ||
      (method !== 0 && method !== 8) ||
      compressedSize === ZIP32_LIMIT ||
      byteLength === ZIP32_LIMIT ||
      localOffset === ZIP32_LIMIT
    )
      throw new ZipArchiveError('Unsupported ZIP entry.');
    let name: string;
    try {
      name = strFromU8(bytes.subarray(at + 46, at + 46 + nameLength));
    } catch {
      throw new ZipArchiveError('Invalid ZIP filename encoding.');
    }
    assertSafeZipEntryName(name);
    if (entries.has(name)) throw new ZipArchiveError('Duplicate ZIP entry.');
    const local = readAt(handle, localOffset, 30);
    const localView = viewOf(local);
    if (
      u32(localView, 0) !== 0x04034b50 ||
      u16(localView, 6) !== flags ||
      u16(localView, 8) !== method
    )
      throw new ZipArchiveError('ZIP local header does not match directory.');
    const localName = readAt(handle, localOffset + 30, u16(localView, 26));
    if (strFromU8(localName) !== name)
      throw new ZipArchiveError('ZIP entry name mismatch.');
    const dataOffset = localOffset + 30 + localName.length + u16(localView, 28);
    if (dataOffset + compressedSize > directoryOffset)
      throw new ZipArchiveError('ZIP entry extends beyond its data area.');
    entries.set(name, {
      name,
      method: method === 0 ? 'store' : 'deflate',
      compressedSize,
      byteLength,
      dataOffset,
    });
    at = next;
  }
  if (at !== bytes.length)
    throw new ZipArchiveError('Incomplete ZIP directory.');
  return entries;
}

/** ZIP mechanics only: callers own entry allowlists, manifests and content hashes. */
export function openZipArchive(uri: string): ZipArchive {
  const source = new File(uri);
  if (!source.exists) throw new ZipArchiveError('ZIP file is unavailable.');
  const handle = source.open();
  try {
    const entries = indexZip(handle, source.size);
    let closed = false;
    const ensureOpen = () => {
      if (closed) throw new ZipArchiveError('ZIP archive is closed.');
    };
    const find = (name: string) => {
      ensureOpen();
      const entry = entries.get(name);
      if (!entry) throw new ZipArchiveError(`ZIP entry is missing: ${name}.`);
      return entry;
    };
    const readEntry = (
      name: string,
      maximumBytes: number,
      write: (bytes: Uint8Array) => void
    ) => {
      const entry = find(name);
      if (entry.byteLength > maximumBytes)
        throw new ZipArchiveError('ZIP entry exceeds size limit.');
      let outputSize = 0;
      const receive = (bytes: Uint8Array) => {
        outputSize += bytes.length;
        if (outputSize > entry.byteLength || outputSize > maximumBytes)
          throw new ZipArchiveError('ZIP entry expanded beyond declared size.');
        write(bytes);
      };
      const inflater =
        entry.method === 'deflate' ? new Inflate(receive) : undefined;
      let remaining = entry.compressedSize;
      let offset = entry.dataOffset;
      if (inflater && !remaining) inflater.push(new Uint8Array(), true);
      while (remaining > 0) {
        const amount = Math.min(ZIP_IO_CHUNK_SIZE, remaining);
        const bytes = readAt(handle, offset, amount);
        offset += amount;
        remaining -= amount;
        if (inflater) inflater.push(bytes, remaining === 0);
        else receive(bytes);
      }
      if (outputSize !== entry.byteLength)
        throw new ZipArchiveError('ZIP entry length does not match directory.');
    };
    return {
      entries,
      readEntry,
      readText(name, maximumBytes) {
        const chunks: Uint8Array[] = [];
        let length = 0;
        readEntry(name, maximumBytes, (bytes) => {
          chunks.push(bytes.slice());
          length += bytes.length;
        });
        return strFromU8(join(chunks, length));
      },
      forEachLine(name, maximumBytes, maximumLineBytes, visit) {
        let pending: Uint8Array = new Uint8Array();
        readEntry(name, maximumBytes, (bytes) => {
          let start = 0;
          for (let i = 0; i < bytes.length; i++) {
            if (bytes[i] !== 10) continue;
            const part = bytes.subarray(start, i + 1);
            const line = join([pending, part], pending.length + part.length);
            if (line.length > maximumLineBytes)
              throw new ZipArchiveError('ZIP line is too large.');
            visit(line);
            pending = new Uint8Array();
            start = i + 1;
          }
          if (start < bytes.length) {
            pending = join(
              [pending, bytes.subarray(start)],
              pending.length + bytes.length - start
            );
            if (pending.length > maximumLineBytes)
              throw new ZipArchiveError('ZIP line is too large.');
          }
        });
        if (pending.length)
          throw new ZipArchiveError('ZIP text entry lacks final newline.');
      },
      async copyStoredEntry(name, write, signal) {
        const entry = find(name);
        if (
          entry.method !== 'store' ||
          entry.compressedSize !== entry.byteLength
        )
          throw new ZipArchiveError('ZIP entry is not stored directly.');
        let remaining = entry.compressedSize;
        let offset = entry.dataOffset;
        let bytesSinceYield = 0;
        while (remaining > 0) {
          checkCancellation(signal);
          const amount = Math.min(ZIP_IO_CHUNK_SIZE, remaining);
          const bytes = readAt(handle, offset, amount);
          offset += amount;
          remaining -= amount;
          write(bytes);
          bytesSinceYield += bytes.length;
          if (bytesSinceYield >= ZIP_YIELD_AFTER_BYTES) {
            bytesSinceYield = 0;
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
          }
        }
        checkCancellation(signal);
      },
      close() {
        if (!closed) {
          closed = true;
          handle.close();
        }
      },
    };
  } catch (error) {
    handle.close();
    throw error;
  }
}
