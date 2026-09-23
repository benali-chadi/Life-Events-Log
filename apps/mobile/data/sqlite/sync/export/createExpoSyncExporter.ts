import {
  createSyncExporter,
  type SyncExportDependencies,
} from './createSyncExporter';
import { createExpoExportWorkspace } from './expoExportWorkspace';
import { compressPackage } from './compressPackage';

/** Production filesystem/compression wiring; UI sharing remains separate. */
export function createExpoSyncExporter(
  dependencies: Omit<
    SyncExportDependencies,
    'createWorkspace' | 'compressPackage'
  >
) {
  return createSyncExporter({
    ...dependencies,
    createWorkspace: createExpoExportWorkspace,
    compressPackage,
  });
}
