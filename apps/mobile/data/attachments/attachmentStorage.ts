import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { attachmentExtension, safeExportFilename } from './attachmentPath';

const ATTACHMENTS_DIRECTORY = 'attachments';

export type StoredAttachmentFile = {
  relativePath: string;
  uri: string;
};

export type ResolvedAttachmentFile = {
  uri: string;
  isAvailable: boolean;
};

export function copyAttachmentIntoStorage({
  sourceUri,
  filename,
  mimeType,
}: {
  sourceUri: string;
  filename: string;
  mimeType: string | null;
}): StoredAttachmentFile {
  const directory = new Directory(Paths.document, ATTACHMENTS_DIRECTORY);
  directory.create({ idempotent: true, intermediates: true });

  const storedFilename = `${randomUUID()}${attachmentExtension(
    filename,
    mimeType
  )}`;
  const relativePath = `${ATTACHMENTS_DIRECTORY}/${storedFilename}`;
  const source = new File(sourceUri);
  const destination = new File(Paths.document, relativePath);

  if (!source.exists) {
    throw new Error(
      `Selected attachment “${filename}” is no longer available.`
    );
  }

  try {
    source.copy(destination);
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }

  return { relativePath, uri: destination.uri };
}

export function resolveAttachmentFile(
  relativePath: string
): ResolvedAttachmentFile {
  if (!isManagedAttachmentPath(relativePath)) {
    return { uri: '', isAvailable: false };
  }

  const file = new File(Paths.document, relativePath);
  return { uri: file.uri, isAvailable: file.exists };
}

export function removeImportedAttachment(relativePath: string) {
  if (!isManagedAttachmentPath(relativePath)) return;

  const file = new File(Paths.document, relativePath);
  if (file.exists) file.delete();
}

export async function shareAttachment({
  uri,
  filename,
  mimeType,
}: {
  uri: string;
  filename: string;
  mimeType: string | null;
}) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  const source = new File(uri);
  if (!source.exists) throw new Error('The attachment file is unavailable.');

  const exportDirectory = new Directory(
    Paths.cache,
    'attachment-exports',
    randomUUID()
  );
  exportDirectory.create({ intermediates: true });
  const exportedFile = new File(exportDirectory, safeExportFilename(filename));

  try {
    source.copy(exportedFile);
    await Sharing.shareAsync(exportedFile.uri, {
      dialogTitle: 'Share attachment',
      mimeType: mimeType ?? undefined,
    });
  } catch (error) {
    if (exportDirectory.exists) exportDirectory.delete();
    throw error;
  }

  // Android receivers can read the shared content URI shortly after the
  // chooser closes, so keep the cache copy alive briefly.
  setTimeout(() => {
    if (exportDirectory.exists) exportDirectory.delete();
  }, 60_000);
}

function isManagedAttachmentPath(relativePath: string) {
  return (
    relativePath.startsWith(`${ATTACHMENTS_DIRECTORY}/`) &&
    !relativePath.includes('..') &&
    !relativePath.includes('\\')
  );
}
