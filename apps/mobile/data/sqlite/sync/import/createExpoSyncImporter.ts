import { syncLocalState } from '../../schema';
import { resolveAttachmentFile } from '../../../attachments/attachmentStorage';
import {
  createSyncImporter,
  type SyncImportDependencies,
} from './createSyncImporter';
import { openExpoSyncPackage } from './openExpoSyncPackage';
import { ReactNativeZipArchiveService } from '../../../compression/ReactNativeZipArchiveService';

/** Production filesystem wiring; UI package selection remains separate. */
export function createExpoSyncImporter(
  dependencies: Omit<SyncImportDependencies, 'openPackage' | 'isBlobAvailable'>
) {
  const archive = new ReactNativeZipArchiveService();
  return createSyncImporter({
    ...dependencies,
    openPackage(uri, signal) {
      const local = dependencies.database.select().from(syncLocalState).get();
      if (!local) throw new Error('Sync local state is not initialized.');
      return openExpoSyncPackage(uri, local.deviceId, archive, signal);
    },
    isBlobAvailable: (hash) => resolveAttachmentFile(hash).isAvailable,
  });
}
