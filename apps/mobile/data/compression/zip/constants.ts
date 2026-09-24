/** Classic ZIP32 limits. ZIP64 is not supported by this adapter. */
export const ZIP32_LIMIT = 0xffffffff;
export const ZIP32_MAX_ENTRIES = 0xffff;
export const ZIP_IO_CHUNK_SIZE = 1024 * 1024;
export const ZIP_YIELD_AFTER_BYTES = 8 * ZIP_IO_CHUNK_SIZE;

export class ZipArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipArchiveError';
  }
}

export function assertSafeZipEntryName(name: string): void {
  const path = name.endsWith('/') ? name.slice(0, -1) : name;
  if (
    !path ||
    path.startsWith('/') ||
    /^[a-zA-Z]:/.test(path) ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((part) => part === '' || part === '.' || part === '..')
  )
    throw new ZipArchiveError('Unsafe ZIP entry name.');
}
