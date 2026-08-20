export function attachmentExtension(filename: string, mimeType: string | null) {
  const filenameExtension = filename.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1];
  if (filenameExtension) return `.${filenameExtension.toLowerCase()}`;

  const normalizedMimeType = mimeType?.trim().toLowerCase();
  const mimeExtensions: Record<string, string> = {
    'image/avif': '.avif',
    'image/gif': '.gif',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };

  return normalizedMimeType ? (mimeExtensions[normalizedMimeType] ?? '') : '';
}

export function safeExportFilename(filename: string) {
  const sanitized = filename
    .trim()
    .replace(/[\\/]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^[.\s-]+/, '')
    .trim();

  return sanitized || 'attachment';
}
