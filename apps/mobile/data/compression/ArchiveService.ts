export type CompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type ArchiveSource = {
  sourceUri: string;
  entryPath?: string;
};

export type ArchiveEntry = {
  path: string;
  uncompressedSize: number;
};

export interface ArchiveService {
  create(
    destinationUri: string,
    sources: readonly ArchiveSource[],
    compressionLevel: CompressionLevel,
    signal?: AbortSignal
  ): Promise<void>;

  append(
    archiveUri: string,
    sources: readonly ArchiveSource[],
    compressionLevel: CompressionLevel,
    signal?: AbortSignal
  ): Promise<void>;

  list(archiveUri: string): Promise<readonly ArchiveEntry[]>;

  extract(
    archiveUri: string,
    entryPaths: readonly string[],
    destinationDirectoryUri: string,
    signal?: AbortSignal
  ): Promise<void>;
}
