import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { attachmentExtension } from './attachmentPath';

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

function isManagedAttachmentPath(relativePath: string) {
  return (
    relativePath.startsWith(`${ATTACHMENTS_DIRECTORY}/`) &&
    !relativePath.includes('..') &&
    !relativePath.includes('\\')
  );
}
