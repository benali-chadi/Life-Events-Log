import type { CausalContext } from '../types';

export type ExportPhase = 'preparing' | 'operations' | 'blobs' | 'compressing';
export type SyncExportOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: {
    phase: ExportPhase;
    completed?: number;
    total?: number;
    cancellable: boolean;
  }) => void;
};
export type SyncPackageManifest = {
  formatVersion: 1;
  operationSchemaVersion: 1;
  packageId: string;
  createdByDeviceId: string;
  createdAt: string;
  exporterFrontier: CausalContext;
  intendedRecipientDeviceId: null;
  baseFrontier: null;
  operations: {
    path: 'operations.jsonl';
    count: number;
    byteLength: number;
    sha256: string;
  };
  blobs: { contentHash: string; byteLength: number }[];
};
export type SyncExportResult = {
  uri: string;
  packageId: string;
  operationCount: number;
  blobCount: number;
};

/** One isolated workspace per export. Compression is supplied separately from
 * storage so the ZIP library can be chosen without changing the exporter.
 */
export type ExportWorkspace = {
  operationsUri: string;
  manifestUri: string;
  partialPackageUri: string;
  openOperations(): { write(bytes: Uint8Array): void; close(): void };
  findBlob(hash: string): { sourceUri: string; byteLength: number } | null;
  writeManifest(manifest: SyncPackageManifest): void;
  finalize(): string;
  cleanup(keepFinalPackage: boolean): void | Promise<void>;
};
