import {
  createSyncExporter,
  type SyncExportDependencies,
} from './createSyncExporter';
import { createExpoExportWorkspace } from './expoExportWorkspace';
import { ReactNativeZipArchiveService } from '../../../compression/ReactNativeZipArchiveService';

/** Production filesystem/compression wiring; UI sharing remains separate. */
export function createExpoSyncExporter(
  dependencies: Omit<SyncExportDependencies, 'createWorkspace' | 'archive'>
) {
  return createSyncExporter({
    ...dependencies,
    createWorkspace: createExpoExportWorkspace,
    archive: new ReactNativeZipArchiveService(),
  });
}
