import {
  comparableMetadataName,
  normalizeMetadataName,
} from '@/data/repositories/metadataName';
import {
  CATEGORY_COLOR_VALUES,
  EVENT_SIGNIFICANCE_VALUES,
  EVENT_TITLE_MAX_LENGTH,
  type CategoryColor,
  type EventSignificance,
  type LocalDate,
  type LocalTime,
} from '@/models';
import type {
  IcsImportCandidate,
  IcsImportCategoryReference,
  IcsImportMappingResult,
  IcsImportMetadataReference,
  IcsImportMetadataSnapshot,
  IcsImportSkipReason,
  IcsImportWarning,
  NewIcsImportMetadata,
  SkippedIcsImportEvent,
} from './types';
import type { ExpandedIcsEvent } from '../parsing/types';

export function mapIcsImport(
  events: readonly ExpandedIcsEvent[],
  metadata: IcsImportMetadataSnapshot
): IcsImportMappingResult {
  const tags = new MetadataResolver('tag', metadata.tags);
  const people = new MetadataResolver('person', metadata.people);
  const locations = new MetadataResolver('location', metadata.locations);
  const categories = new CategoryResolver(metadata.categories);
  const candidates: IcsImportCandidate[] = [];
  const skipped: SkippedIcsImportEvent[] = [];

  events.forEach((event, occurrenceIndex) => {
    const skipReason = eventSkipReason(event);
    if (skipReason) {
      skipped.push({
        sourceIndex: event.sourceIndex,
        uid: event.uid,
        title: event.title,
        reason: skipReason,
      });
      return;
    }

    const warnings: IcsImportWarning[] = [];
    const title = mappedTitle(event.title, warnings);
    const attendeeNames = event.attendees.flatMap((attendee) => {
      const name = attendeeName(attendee.commonName, attendee.uri);
      if (name) return [name];
      warnings.push({
        code: 'attendee-name-missing',
        message: `An attendee on “${title}” has no usable name or email address.`,
      });
      return [];
    });

    candidates.push({
      id: candidateId(event, occurrenceIndex),
      event: {
        title,
        date: event.start!.value.slice(0, 10) as LocalDate,
        time: event.start!.isDate
          ? null
          : (event.start!.value.slice(11, 16) as LocalTime),
        notes: event.description ?? '',
        significance: mappedSignificance(event.lelSignificance, warnings),
      },
      tags: tags.resolveMany(event.categories),
      people: people.resolveMany(attendeeNames),
      location: event.location ? locations.resolve(event.location) : null,
      category: categories.resolve(event.lelCategory, warnings),
      source: {
        sourceIndex: event.sourceIndex,
        uid: event.uid,
        timezone: event.start!.timezone,
        recurring: event.series !== null,
      },
      warnings,
    });
  });

  return {
    candidates,
    newMetadata: {
      tags: tags.newMetadata,
      people: people.newMetadata,
      locations: locations.newMetadata,
    },
    skipped,
  };
}

class CategoryResolver {
  private readonly existingByName = new Map<
    string,
    IcsImportCategoryReference
  >();

  constructor(existing: IcsImportMetadataSnapshot['categories']) {
    for (const category of existing) {
      const name = comparableMetadataName(category.name);
      if (!this.existingByName.has(name)) {
        this.existingByName.set(name, { kind: 'existing', entity: category });
      }
    }
  }

  resolve(
    source: ExpandedIcsEvent['lelCategory'],
    warnings: IcsImportWarning[]
  ): IcsImportCategoryReference | null {
    if (!source) return null;
    const name = normalizeMetadataName(source.name);
    if (!name) return null;
    const comparable = comparableMetadataName(name);
    const existing = this.existingByName.get(comparable);
    if (existing) return existing;

    const color = mappedCategoryColor(source.color, warnings);
    const proposed: IcsImportCategoryReference = {
      kind: 'new',
      category: { name, color },
    };
    this.existingByName.set(comparable, proposed);
    return proposed;
  }
}

function mappedCategoryColor(
  source: string | null,
  warnings: IcsImportWarning[]
): CategoryColor {
  const normalized = source?.toLowerCase();
  if (
    normalized &&
    CATEGORY_COLOR_VALUES.includes(normalized as CategoryColor)
  ) {
    return normalized as CategoryColor;
  }
  warnings.push({
    code: 'invalid-category-color',
    message: 'This imported category has no valid color and will use blue.',
  });
  return 'blue';
}

function mappedSignificance(
  source: string | null,
  warnings: IcsImportWarning[]
): EventSignificance {
  if (!source) return 'ordinary';
  const normalized = source.toLowerCase() as EventSignificance;
  if (EVENT_SIGNIFICANCE_VALUES.includes(normalized)) return normalized;
  warnings.push({
    code: 'invalid-significance',
    message: 'This event has an invalid significance and will use ordinary.',
  });
  return 'ordinary';
}

class MetadataResolver<TEntity extends { id: string; name: string }> {
  readonly newMetadata: NewIcsImportMetadata[] = [];
  private readonly existingByName = new Map<string, TEntity>();
  private readonly newByName = new Map<string, NewIcsImportMetadata>();

  constructor(
    private readonly type: 'tag' | 'person' | 'location',
    existing: readonly TEntity[]
  ) {
    for (const entity of existing) {
      if (!this.existingByName.has(comparableMetadataName(entity.name))) {
        this.existingByName.set(comparableMetadataName(entity.name), entity);
      }
    }
  }

  resolve(name: string): IcsImportMetadataReference<TEntity> | null {
    const normalized = normalizeMetadataName(name);
    if (!normalized) return null;
    const comparable = comparableMetadataName(normalized);
    const existing = this.existingByName.get(comparable);
    if (existing) return { kind: 'existing', entity: existing };

    let proposed = this.newByName.get(comparable);
    if (!proposed) {
      proposed = {
        temporaryId: `new:${this.type}:${comparable}`,
        name: normalized,
      };
      this.newByName.set(comparable, proposed);
      this.newMetadata.push(proposed);
    }
    return { kind: 'new', metadata: proposed };
  }

  resolveMany(names: readonly string[]): IcsImportMetadataReference<TEntity>[] {
    const resolved = new Map<string, IcsImportMetadataReference<TEntity>>();
    for (const name of names) {
      const reference = this.resolve(name);
      if (!reference) continue;
      const key =
        reference.kind === 'existing'
          ? `existing:${reference.entity.id}`
          : `new:${reference.metadata.temporaryId}`;
      resolved.set(key, reference);
    }
    return [...resolved.values()];
  }
}

function eventSkipReason(event: ExpandedIcsEvent): IcsImportSkipReason | null {
  if (event.status?.toUpperCase() === 'CANCELLED') return 'cancelled';
  if (!event.start) return 'missing-start';
  if (!validStart(event.start.value, event.start.isDate))
    return 'invalid-start';
  return null;
}

function validStart(value: string, isDate: boolean): boolean {
  if (isDate) return validDate(value);
  const match =
    /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?Z?$/.exec(
      value
    );
  return !!match && validDate(match[1]!);
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function mappedTitle(
  sourceTitle: string | null,
  warnings: IcsImportWarning[]
): string {
  const normalized = normalizeMetadataName(sourceTitle ?? '');
  if (!normalized) {
    warnings.push({
      code: 'missing-title',
      message:
        'This event has no title and will be imported as “Untitled event”.',
    });
    return 'Untitled event';
  }
  if (normalized.length <= EVENT_TITLE_MAX_LENGTH) return normalized;

  warnings.push({
    code: 'title-truncated',
    message: `This title exceeds ${EVENT_TITLE_MAX_LENGTH} characters and will be shortened.`,
  });
  return normalized.slice(0, EVENT_TITLE_MAX_LENGTH).trimEnd();
}

function attendeeName(commonName: string | null, uri: string): string | null {
  const normalizedCommonName = normalizeMetadataName(commonName ?? '');
  if (normalizedCommonName) return normalizedCommonName;
  if (!uri.toLowerCase().startsWith('mailto:')) return null;

  const email = normalizeMetadataName(uri.slice('mailto:'.length));
  if (!email) return null;
  try {
    return decodeURIComponent(email);
  } catch {
    return email;
  }
}

function candidateId(event: ExpandedIcsEvent, occurrenceIndex: number): string {
  const occurrence =
    event.series?.recurrenceId.value ?? event.start?.value ?? '';
  return `${event.sourceIndex}:${event.uid ?? ''}:${occurrence}:${occurrenceIndex}`;
}
