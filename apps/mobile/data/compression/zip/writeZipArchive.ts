import { File } from 'expo-file-system';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import {
  assertSafeZipEntryName,
  ZIP32_LIMIT,
  ZIP32_MAX_ENTRIES,
  ZIP_IO_CHUNK_SIZE,
  ZIP_YIELD_AFTER_BYTES,
  ZipArchiveError,
} from './constants';

export type ZipWriteEntry = {
  name: string;
  sourceUri: string;
  compression: 'deflate' | 'store';
};

/** Bounded, synchronous-codec ZIP32 writer; no application-specific paths. */
export async function writeZipArchive(
  destination: string,
  entries: readonly ZipWriteEntry[],
  yieldToApp: () => Promise<void> = () =>
    new Promise((resolve) => setTimeout(resolve, 0))
): Promise<void> {
  const output = new File(destination);
  if (output.exists)
    throw new ZipArchiveError('ZIP destination already exists.');
  if (entries.length >= ZIP32_MAX_ENTRIES)
    throw new ZipArchiveError('Archive requires ZIP64: too many entries.');
  const names = new Set<string>();
  const sources = entries.map((entry) => {
    assertSafeZipEntryName(entry.name);
    if (names.has(entry.name))
      throw new ZipArchiveError('Duplicate ZIP entry.');
    names.add(entry.name);
    const file = new File(entry.sourceUri);
    if (!file.exists) throw new ZipArchiveError('ZIP source file is missing.');
    if (
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      file.size >= ZIP32_LIMIT
    )
      throw new ZipArchiveError('ZIP source file exceeds classic ZIP limits.');
    return { ...entry, file };
  });
  let handle: ReturnType<File['open']> | undefined;
  let created = false;
  let success = false;
  let zip: Zip | undefined;
  try {
    output.create();
    created = true;
    handle = output.open();
    let written = 0;
    let finished = false;
    zip = new Zip((error, bytes, final) => {
      if (error) throw error;
      written += bytes.length;
      if (written >= ZIP32_LIMIT)
        throw new ZipArchiveError('Archive exceeds classic ZIP limits.');
      handle!.writeBytes(bytes);
      if (final) finished = true;
    });
    let bytesSinceYield = 0;
    for (const { name, file, compression } of sources) {
      const entry =
        compression === 'deflate'
          ? new ZipDeflate(name, { level: 6 })
          : new ZipPassThrough(name);
      zip.add(entry);
      const input = file.open();
      try {
        let remaining = file.size;
        if (!remaining) entry.push(new Uint8Array(0), true);
        while (remaining > 0) {
          const bytes = input.readBytes(Math.min(ZIP_IO_CHUNK_SIZE, remaining));
          if (!bytes.length || bytes.length > remaining)
            throw new ZipArchiveError('Unexpected ZIP source length.');
          remaining -= bytes.length;
          entry.push(bytes, remaining === 0);
          bytesSinceYield += bytes.length;
          if (bytesSinceYield >= ZIP_YIELD_AFTER_BYTES) {
            bytesSinceYield = 0;
            await yieldToApp();
          }
        }
      } finally {
        input.close();
      }
    }
    zip.end();
    if (!finished) throw new ZipArchiveError('ZIP output did not finish.');
    handle.close();
    handle = undefined;
    success = true;
  } finally {
    if (!success) zip?.terminate();
    try {
      handle?.close();
    } finally {
      if (!success && created) {
        try {
          if (output.exists) output.delete();
        } catch (error) {
          console.error('Partial ZIP cleanup failed', error);
        }
      }
    }
  }
}
