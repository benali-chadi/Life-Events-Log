const allowedLinkSchemes = new Set(['http:', 'https:', 'mailto:']);

export function getAllowedLink(value: string) {
  const trimmedValue = value.trim();

  try {
    const url = new URL(trimmedValue);

    if (!allowedLinkSchemes.has(url.protocol.toLowerCase())) return null;
    if (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.hostname
    ) {
      return null;
    }
    if (url.protocol === 'mailto:' && !url.pathname) return null;

    return trimmedValue;
  } catch {
    return null;
  }
}
