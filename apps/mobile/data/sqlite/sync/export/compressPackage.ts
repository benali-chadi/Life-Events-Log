import { Directory, File } from 'expo-file-system';
import { writeZipArchive, type ZipWriteEntry } from '../../../compression/zip';

/** Build the LEL entry list; ZIP mechanics live in data/compression/zip. */
export async function compressPackage(
  {
    sourceDirectory,
    destination,
  }: { sourceDirectory: string; destination: string },
  yieldToApp?: () => Promise<void>
): Promise<void> {
  const source = new Directory(sourceDirectory);
  if (new File(destination).uri.startsWith(source.uri.replace(/\/?$/, '/')))
    throw new Error('Compression output must be outside package contents.');
  const entries: ZipWriteEntry[] = [
    {
      name: 'manifest.json',
      sourceUri: new File(source, 'manifest.json').uri,
      compression: 'deflate',
    },
    {
      name: 'operations.jsonl',
      sourceUri: new File(source, 'operations.jsonl').uri,
      compression: 'deflate',
    },
  ];
  for (const file of new Directory(source, 'blobs').list()) {
    if (!(file instanceof File) || !/^[0-9a-f]{64}$/.test(file.name))
      throw new Error('Unexpected staged blob entry.');
    entries.push({
      name: `blobs/${file.name}`,
      sourceUri: file.uri,
      compression: 'store',
    });
  }
  return writeZipArchive(destination, entries, yieldToApp);
}
