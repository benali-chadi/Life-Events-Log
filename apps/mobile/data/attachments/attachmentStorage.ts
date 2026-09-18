import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { safeExportFilename } from './attachmentPath';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import * as Crypto from 'expo-crypto';

const ATTACHMENTS_DIRECTORY = 'attachments';

export type StoredAttachmentFile = {
  contentHash: string;
  uri: string;
};

export type ResolvedAttachmentFile = {
  uri: string;
  isAvailable: boolean;
};

export async function copyAttachmentIntoStorage({
  sourceUri,
  filename,
}: {
  sourceUri: string;
  filename: string;
  mimeType: string | null;
}): Promise<StoredAttachmentFile> {
  const directory = new Directory(Paths.document, ATTACHMENTS_DIRECTORY);
  directory.create({ idempotent: true, intermediates: true });

  const source = new File(sourceUri);
  const staging = new Directory(Paths.cache, 'attachment-staging');
  staging.create({ idempotent: true, intermediates: true });
  const temporary = new File(staging, randomUUID());
  let promoted = false;

  if (!source.exists) {
    throw new Error(
      `Selected attachment “${filename}” is no longer available.`
    );
  }

  try {
    source.copy(temporary);
    const contentHash = await hashAttachmentFile(temporary);
    const destination = new File(directory, contentHash);
    if (!destination.exists) {
      temporary.move(destination);
      promoted = true;
    }
    return { contentHash, uri: destination.uri };
  } finally {
    if (!promoted && temporary.exists) temporary.delete();
  }
}

/** Incremental hashing bounds memory and yields between chunks. */
export async function hashAttachmentFile(file: File): Promise<string> {
  const bytes = await file.bytes();
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    bytes
  );
  return bytesToHex(new Uint8Array(digest));
}

export function resolveAttachmentFile(
  contentHash: string
): ResolvedAttachmentFile {
  if (!/^[0-9a-f]{64}$/.test(contentHash)) {
    return { uri: '', isAvailable: false };
  }

  const file = new File(Paths.document, ATTACHMENTS_DIRECTORY, contentHash);
  return { uri: file.uri, isAvailable: file.exists };
}

/** Copies legacy content before the database commits; retries keep the source. */
export async function migrateLegacyAttachmentFile(
  relativePath: string
): Promise<string | null> {
  if (!isManagedAttachmentPath(relativePath))
    throw new Error('Invalid legacy attachment path.');
  const file = new File(Paths.document, relativePath);
  if (!file.exists) return null;
  const result = await copyAttachmentIntoStorage({
    sourceUri: file.uri,
    filename: file.name,
    mimeType: null,
  });
  return result.contentHash;
}

export function removeLegacyAttachmentFile(relativePath: string) {
  if (!isManagedAttachmentPath(relativePath))
    throw new Error('Invalid legacy attachment path.');
  // Never delete a content-addressed blob, even if an old row points at one.
  if (/^attachments\/[0-9a-f]{64}$/.test(relativePath)) return;
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
