import type { SyncPackageManifest } from '../export/types';

export type ImportPhase =
  'preparing' | 'applying-operations' | 'repairing-blobs';
export type SyncImportOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: {
    phase: ImportPhase;
    completed?: number;
    total?: number;
    cancellable: boolean;
  }) => void;
};
export type SyncImportResult = {
  packageId: string;
  operations:
    | { status: 'already-covered'; applied: 0 }
    | { status: 'processed'; applied: number; alreadyPresent: number };
  blobs: {
    restored: number;
    stillMissing: number;
    failed: number;
    cancelled: boolean;
  };
};

/** The adapter owns any extracted temporary files until cleanup. */
export type PreparedSyncPackage = {
  manifest: SyncPackageManifest;
  forEachOperationLine(visit: (line: Uint8Array) => void): void;
  repairBlob(
    hash: string,
    signal?: AbortSignal
  ): Promise<'restored' | 'missing' | 'failed'>;
  cleanup(): void | Promise<void>;
};

export class SyncPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncPackageError';
  }
}
