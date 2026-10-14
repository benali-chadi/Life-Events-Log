import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeIndexer, normalizeDirectory } from './normalize-glide-indexers.mjs';

const source = (name, modules) => `package com.bumptech.glide;
import com.bumptech.glide.annotation.compiler.Index;
@Index(modules = {${modules.map(value => JSON.stringify(value)).join(',\n')}})
public class ${name} {
}
`;

test('different discovery orders and UUIDs produce identical Java', () => {
  const a = normalizeIndexer(source('GlideIndexer_first', ['expo.SVG', 'expo.Blur']));
  const b = normalizeIndexer(source('GlideIndexer_second', ['expo.Blur', 'expo.SVG']));
  assert.deepEqual(a, b);
  assert.deepEqual(normalizeIndexer(a.text), a);
});

test('single modules and extensions are supported without name collisions', () => {
  const single = source('GlideIndexer_one', ['expo.SVG']).replace('{"expo.SVG"}', '"expo.SVG"');
  assert.match(normalizeIndexer(single).text, /modules = \{"expo.SVG"\}/);
  assert.notEqual(normalizeIndexer(single).name, normalizeIndexer(single.replace('modules =', 'extensions =')).name);
});

test('unexpected processor output fails instead of silently leaving unstable code', () => {
  assert.throws(() => normalizeIndexer('public class GlideIndexer_unknown {}'));
  assert.throws(() => normalizeIndexer(source('GlideIndexer_one', ['expo.SVG']).replace('"expo.SVG"', 'MODULE')));
});

test('renames generated files, remains idempotent, and leaves runtime code untouched', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lel-glide-'));
  try {
    writeFileSync(join(directory, 'GlideIndexer_old.java'), source('GlideIndexer_old', ['expo.SVG', 'expo.Blur']));
    const runtime = 'appGlideModule.registerComponents(context, glide, registry);';
    writeFileSync(join(directory, 'GeneratedAppGlideModuleImpl.java'), runtime);
    assert.equal(normalizeDirectory(directory), 1);
    const before = readdirSync(directory).sort();
    assert.ok(!before.includes('GlideIndexer_old.java'));
    assert.equal(normalizeDirectory(directory), 1);
    assert.deepEqual(readdirSync(directory).sort(), before);
    assert.equal(readFileSync(join(directory, 'GeneratedAppGlideModuleImpl.java'), 'utf8'), runtime);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
