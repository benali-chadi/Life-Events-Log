import type { File } from 'expo-file-system';
import { SyncPackageError } from './types';

/** Synchronous bounded reader: the caller hashes/applies exact lines in one DB transaction. */
export function forEachOperationLine(
  file: File,
  maximum: number,
  visit: (line: Uint8Array) => void
): void {
  const handle = file.open();
  let pending: Uint8Array[] = [];
  let length = 0;
  try {
    let remaining = file.size;
    while (remaining > 0) {
      const bytes = handle.readBytes(Math.min(1024 * 1024, remaining));
      if (!bytes.length)
        throw new SyncPackageError('Truncated operations file.');
      remaining -= bytes.length;
      let start = 0;
      for (let i = 0; i < bytes.length; i++) {
        if (bytes[i] !== 10) continue;
        const part = bytes.subarray(start, i + 1);
        length += part.length;
        if (length > maximum)
          throw new SyncPackageError('Operation line is too large.');
        const line = new Uint8Array(length);
        let offset = 0;
        for (const chunk of pending) {
          line.set(chunk, offset);
          offset += chunk.length;
        }
        line.set(part, offset);
        visit(line);
        pending = [];
        length = 0;
        start = i + 1;
      }
      if (start < bytes.length) {
        const part = bytes.slice(start);
        length += part.length;
        if (length > maximum)
          throw new SyncPackageError('Operation line is too large.');
        pending.push(part);
      }
    }
    if (length)
      throw new SyncPackageError('Operations file lacks final newline.');
  } finally {
    handle.close();
  }
}
