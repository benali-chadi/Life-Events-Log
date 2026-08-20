import { describe, expect, it } from 'vitest';
import { attachmentExtension, safeExportFilename } from './attachmentPath';

describe('attachmentExtension', () => {
  it('prefers and normalizes a safe filename extension', () => {
    expect(attachmentExtension('Summer.Photo.JPEG', 'image/png')).toBe('.jpeg');
  });

  it('falls back to a known MIME type', () => {
    expect(attachmentExtension('photo', ' IMAGE/JPEG ')).toBe('.jpg');
  });

  it('omits unknown or suspicious extensions', () => {
    expect(attachmentExtension('photo.extensionthatiswaytoolong', null)).toBe(
      ''
    );
    expect(attachmentExtension('photo', 'application/octet-stream')).toBe('');
  });
});

describe('safeExportFilename', () => {
  it('preserves ordinary filenames', () => {
    expect(safeExportFilename('Summer photo.jpg')).toBe('Summer photo.jpg');
  });

  it('removes path traversal and control characters', () => {
    expect(safeExportFilename('../private/\u0000photo.jpg')).toBe(
      'private-photo.jpg'
    );
  });

  it('provides a fallback filename', () => {
    expect(safeExportFilename(' ... ')).toBe('attachment');
  });
});
