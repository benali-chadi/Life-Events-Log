import { describe, expect, it } from 'vitest';
import { attachmentExtension } from './attachmentPath';

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
