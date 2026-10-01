export type CleanupResult = {
  scanned: number;
  deleted: number;
  failed: number;
  cancelled: boolean;
};

export type BlobCleanupStorage = {
  /** Immediate managed file names only; never traverse directories. */
  listBlobs(): string[];
  /** False means the file was already absent. */
  deleteBlob(contentHash: string): boolean;
};

export type BlobCleanupReferences = {
  liveContentHashes(): Set<string>;
};

export type CleanupOptions = {
  references: BlobCleanupReferences;
  storage: BlobCleanupStorage;
  signal?: AbortSignal;
  batchSize?: number;
  yieldToApp?: () => Promise<void>;
};
