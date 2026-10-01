import { Directory, File, Paths } from 'expo-file-system';
import type { ExportWorkspace } from './types';

/** Native filesystem adapter. Completed packages survive staging cleanup and
 * sharing; retention of old completed exports is a separate lifecycle policy.
 */
export function createExpoExportWorkspace(packageId: string): ExportWorkspace {
  if (!/^[a-zA-Z0-9_-]+$/.test(packageId))
    throw new Error('Invalid export package ID.');
  const root = new Directory(Paths.cache, 'sync-exports', packageId);
  if (root.exists) throw new Error('Export workspace already exists.');
  const contents = new Directory(root, 'contents');
  const partial = new File(root, 'package.partial');
  const final = new File(root, `${packageId}.lel-package`);
  try {
    contents.create({ intermediates: true });
  } catch (error) {
    try {
      if (root.exists) root.delete();
    } catch {
      /* Preserve creation failure. */
    }
    throw error;
  }
  return {
    operationsUri: new File(contents, 'operations.jsonl').uri,
    manifestUri: new File(contents, 'manifest.json').uri,
    partialPackageUri: partial.uri,
    openOperations() {
      const file = new File(contents, 'operations.jsonl');
      file.create();
      const handle = file.open();
      return {
        write: (bytes) => handle.writeBytes(bytes),
        close: () => handle.close(),
      };
    },
    findBlob(hash) {
      if (!/^[0-9a-f]{64}$/.test(hash))
        throw new Error('Invalid attachment content hash.');
      const source = new File(Paths.document, 'attachments', hash);
      if (!source.exists) return null;
      return { sourceUri: source.uri, byteLength: source.size };
    },
    writeManifest(manifest) {
      const file = new File(contents, 'manifest.json');
      file.create();
      file.write(JSON.stringify(manifest));
    },
    finalize() {
      if (!partial.exists)
        throw new Error('Compression did not produce a package.');
      partial.move(final);
      return final.uri;
    },
    cleanup(keepFinalPackage) {
      if (!keepFinalPackage) {
        if (root.exists) root.delete();
      } else if (contents.exists) contents.delete();
    },
  };
}
