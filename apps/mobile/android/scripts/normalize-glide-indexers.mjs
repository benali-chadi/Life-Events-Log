import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// KAPT emits an empty Java class carrying @Index. Canonicalise only that
// metadata; Glide 4.16 already sorts runtime module registration separately.
export function normalizeIndexer(source) {
  const annotation = source.match(/@Index\(\s*(modules|extensions)\s*=\s*(\{[\s\S]*?\}|"[^"]+")\s*\)/);
  const declaration = source.match(/public class (GlideIndexer_\w+)\s*\{\s*\}/);
  if (!annotation || !declaration) {
    throw new Error('Unexpected Glide 4 Java indexer format; inspect the generated source.');
  }
  const names = [...annotation[2].matchAll(/"([\w.$]+)"/g)].map(match => match[1]).sort();
  const remainder = annotation[2].replace(/"[\w.$]+"/g, '').replace(/[\s{},]/g, '');
  if (!names.length || remainder) throw new Error('Unexpected Glide index annotation values.');
  const kind = annotation[1];
  const digest = createHash('sha256').update(`${kind}\n${names.join('\n')}`).digest('hex');
  const name = `GlideIndexer_${digest}`;
  const text = source
    .replace(annotation[0], `@Index(${kind} = {${names.map(value => JSON.stringify(value)).join(', ')}})`)
    .replace(`public class ${declaration[1]}`, `public class ${name}`);
  return { name, text };
}

export function normalizeDirectory(directory) {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) count += normalizeDirectory(path);
    else if (/^GlideIndexer_.*\.java$/.test(entry.name)) {
      const result = normalizeIndexer(readFileSync(path, 'utf8'));
      const target = join(directory, `${result.name}.java`);
      writeFileSync(target, result.text);
      if (target !== path) unlinkSync(path);
      count++;
    }
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const count = normalizeDirectory(process.argv[2]);
  if (!count) throw new Error('No Glide Java indexers found; check the KAPT output directory.');
  console.log(`Normalised ${count} Glide Java indexer(s).`);
}
