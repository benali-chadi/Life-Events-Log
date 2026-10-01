import { expect, it } from 'vitest';
import { validateManifest } from './validateSyncPackage';

const manifest = {
  formatVersion: 1,
  operationSchemaVersion: 1,
  packageId: 'package-id',
  createdByDeviceId: 'sender',
  createdAt: '2026-09-24T12:00:00.000Z',
  exporterFrontier: { sender: 1 },
  intendedRecipientDeviceId: null,
  baseFrontier: null,
  operations: {
    path: 'operations.jsonl',
    count: 1,
    byteLength: 2,
    sha256: 'a'.repeat(64),
  },
  blobs: [{ contentHash: 'b'.repeat(64), byteLength: 10 }],
};

it('accepts the full-history manifest but rejects unsupported formats and recipients', () => {
  expect(validateManifest(manifest, 'receiver')).toEqual(manifest);
  expect(() =>
    validateManifest({ ...manifest, formatVersion: 2 }, 'receiver')
  ).toThrow('format');
  expect(() =>
    validateManifest({ ...manifest, operationSchemaVersion: 2 }, 'receiver')
  ).toThrow('schema');
  expect(() =>
    validateManifest(
      { ...manifest, intendedRecipientDeviceId: 'other' },
      'receiver'
    )
  ).toThrow('different device');
  expect(() =>
    validateManifest({ ...manifest, baseFrontier: {} }, 'receiver')
  ).toThrow('Incremental');
});

it('rejects malformed frontiers and duplicate blob descriptors', () => {
  expect(() =>
    validateManifest(
      { ...manifest, exporterFrontier: { sender: -1 } },
      'receiver'
    )
  ).toThrow('frontier');
  expect(() =>
    validateManifest(
      { ...manifest, blobs: [manifest.blobs[0], manifest.blobs[0]] },
      'receiver'
    )
  ).toThrow('duplicate');
});
