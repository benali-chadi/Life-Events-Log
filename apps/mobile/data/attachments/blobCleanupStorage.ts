import { Directory, File, Paths } from 'expo-file-system';
import type { BlobCleanupStorage } from '../jobs/attachmentBlobCleanup/types';

/** Only content-addressed files directly inside the managed attachments folder. */
export const attachmentBlobCleanupStorage: BlobCleanupStorage = {
  listBlobs() {
    const directory = new Directory(Paths.document, 'attachments');
    if (!directory.exists) return [];
    return directory
      .list()
      .filter(
        (entry): entry is File =>
          entry instanceof File && /^[0-9a-f]{64}$/.test(entry.name)
      )
      .map((file) => file.name);
  },
  deleteBlob(hash) {
    if (!/^[0-9a-f]{64}$/.test(hash))
      throw new Error('Invalid attachment content hash.');
    const file = new File(Paths.document, 'attachments', hash);
    if (!file.exists) return false;
    try {
      file.delete();
    } catch (error) {
      if (!file.exists) return false;
      throw error;
    }
    return true;
  },
};
