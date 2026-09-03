import type { EventExportItem } from '@/data/repositories';

const PRODUCT_ID = '-//Life Events Log//iCalendar Export//EN';
const UID_DOMAIN = 'lifeeventslog.local';

export function serializeEventsToIcs(
  events: readonly EventExportItem[],
  exportedAt: Date
): string {
  const timestamp = utcDateTime(exportedAt);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODUCT_ID}`,
    'CALSCALE:GREGORIAN',
  ];

  for (const details of events) {
    lines.push(...eventLines(details, timestamp));
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

function eventLines(details: EventExportItem, timestamp: string): string[] {
  const { event } = details;
  const lines = [
    'BEGIN:VEVENT',
    `UID:${escapeText(`${event.id}@${UID_DOMAIN}`)}`,
    `DTSTAMP:${timestamp}`,
    dateStart(event.date, event.time),
    `SUMMARY:${escapeText(event.title)}`,
  ];

  if (event.notes) lines.push(`DESCRIPTION:${escapeText(event.notes)}`);
  if (details.location) {
    lines.push(`LOCATION:${escapeText(details.location.name)}`);
  }
  if (details.tags.length > 0) {
    lines.push(
      `CATEGORIES:${details.tags.map((tag) => escapeText(tag.name)).join(',')}`
    );
  }
  for (const person of details.people) {
    lines.push(
      `ATTENDEE;CN=${parameterValue(person.name)}:urn:lel:person:${encodeURIComponent(person.id)}`
    );
  }
  if (details.category) {
    lines.push(
      `X-LEL-CATEGORY;COLOR=${details.category.color}:${escapeText(details.category.name)}`
    );
  }
  lines.push(`X-LEL-SIGNIFICANCE:${event.significance}`, 'END:VEVENT');
  return lines;
}

function dateStart(date: string, time: string | null) {
  const compactDate = date.replaceAll('-', '');
  if (!time) return `DTSTART;VALUE=DATE:${compactDate}`;
  return `DTSTART:${compactDate}T${time.replace(':', '')}00`;
}

function utcDateTime(date: Date) {
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError('The ICS export timestamp must be a valid date.');
  }
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function escapeText(value: string) {
  return value
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}

function parameterValue(value: string) {
  const encoded = value
    .replaceAll('^', '^^')
    .replace(/\r\n|\r|\n/g, '^n')
    .replaceAll('"', "^'");
  return `"${encoded}"`;
}

/** RFC 5545 content lines are folded at 75 UTF-8 octets. */
function foldIcsLine(line: string) {
  const chunks: string[] = [];
  let chunk = '';
  let chunkBytes = 0;
  let byteLimit = 75;

  for (const character of line) {
    const characterBytes = utf8ByteLength(character);
    if (chunkBytes + characterBytes > byteLimit) {
      chunks.push(chunk);
      chunk = character;
      chunkBytes = characterBytes;
      byteLimit = 74;
    } else {
      chunk += character;
      chunkBytes += characterBytes;
    }
  }
  chunks.push(chunk);
  return chunks.join('\r\n ');
}

function utf8ByteLength(character: string) {
  const codePoint = character.codePointAt(0)!;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}
