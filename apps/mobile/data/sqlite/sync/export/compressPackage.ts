import { Directory, File } from 'expo-file-system';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';

const CHUNK_SIZE = 1024 * 1024;
const YIELD_AFTER_BYTES = 8 * 1024 * 1024;
// This adapter writes classic ZIP, not ZIP64. Reject rather than truncate sizes.
const ZIP_LIMIT = 0xffffffff;

/** Synchronous streaming codecs, with periodic UI yields between bounded file reads.
 * No cancellation during compression. Output is owned by this invocation and
 * removed on failure; source files are never changed.
 */
export async function compressPackage(
  {
    sourceDirectory,
    destination,
  }: {
    sourceDirectory: string;
    destination: string;
  },
  yieldToApp: () => Promise<void> = () =>
    new Promise((resolve) => setTimeout(resolve, 0))
): Promise<void> {
  const source = new Directory(sourceDirectory);
  const output = new File(destination);
  if (output.exists) throw new Error('Compression destination already exists.');
  if (output.uri.startsWith(source.uri.replace(/\/?$/, '/')))
    throw new Error('Compression output must be outside package contents.');
  const entries = [
    {
      name: 'manifest.json',
      file: new File(source, 'manifest.json'),
      compress: true,
    },
    {
      name: 'operations.jsonl',
      file: new File(source, 'operations.jsonl'),
      compress: true,
    },
  ];
  for (const file of new Directory(source, 'blobs').list()) {
    if (!(file instanceof File) || !/^[0-9a-f]{64}$/.test(file.name))
      throw new Error('Unexpected staged blob entry.');
    entries.push({ name: `blobs/${file.name}`, file, compress: false });
  }
  if (entries.length >= 0xffff)
    throw new Error('Package requires ZIP64: too many files.');
  for (const { file } of entries) {
    if (!file.exists) throw new Error('Staged package file is missing.');
    if (
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      file.size >= ZIP_LIMIT
    )
      throw new Error('Package file exceeds classic ZIP limits.');
  }

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
      if (written >= ZIP_LIMIT)
        throw new Error('Package exceeds classic ZIP limits.');
      handle!.writeBytes(bytes);
      if (final) finished = true;
    });
    let bytesSinceYield = 0;
    for (const { name, file, compress } of entries) {
      const entry = compress
        ? new ZipDeflate(name, { level: 6 })
        : new ZipPassThrough(name);
      zip.add(entry);
      const input = file.open();
      try {
        let remaining = file.size;
        if (!remaining) entry.push(new Uint8Array(0), true);
        while (remaining > 0) {
          const bytes = input.readBytes(Math.min(CHUNK_SIZE, remaining));
          if (!bytes.length || bytes.length > remaining)
            throw new Error('Unexpected staged file length.');
          remaining -= bytes.length;
          entry.push(bytes, remaining === 0);
          bytesSinceYield += bytes.length;
          if (bytesSinceYield >= YIELD_AFTER_BYTES) {
            bytesSinceYield = 0;
            await yieldToApp();
          }
        }
      } finally {
        input.close();
      }
    }
    zip.end();
    if (!finished) throw new Error('ZIP output did not finish.');
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
