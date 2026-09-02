import {
  EVENT_SIGNIFICANCE_VALUES,
  EVENT_TITLE_MAX_LENGTH,
  CATEGORY_COLOR_VALUES,
  type EventSignificance,
  type LocalDate,
  type LocalTime,
} from '@/models';
import { ModelValidationError } from './errors';
import type {
  EventImportEventInput,
  EventImportCategory,
  NewEventImportMetadata,
} from './EventImportRepository';
import { normalizeMetadataName } from './metadataName';

export function validateEventImportValues(
  input: EventImportEventInput
): EventImportEventInput {
  const title = normalizeMetadataName(input.title);
  if (!title) throw new ModelValidationError('Event title cannot be empty.');
  if (title.length > EVENT_TITLE_MAX_LENGTH) {
    throw new ModelValidationError(
      `Event title cannot exceed ${EVENT_TITLE_MAX_LENGTH} characters.`
    );
  }
  if (!validDate(input.date)) {
    throw new ModelValidationError(`Invalid event date “${input.date}”.`);
  }
  if (input.time !== null && !validTime(input.time)) {
    throw new ModelValidationError(`Invalid event time “${input.time}”.`);
  }
  if (!validSignificance(input.significance)) {
    throw new ModelValidationError(
      `Invalid event significance “${input.significance}”.`
    );
  }
  return { ...input, title };
}

export function validateNewMetadataDefinitions(
  entityName: string,
  definitions: readonly NewEventImportMetadata[]
): NewEventImportMetadata[] {
  const temporaryIds = new Set<string>();
  return definitions.map((definition) => {
    const temporaryId = definition.temporaryId.trim();
    const name = normalizeMetadataName(definition.name);
    if (!temporaryId) {
      throw new ModelValidationError(
        `${entityName} temporary ID cannot be empty.`
      );
    }
    if (temporaryIds.has(temporaryId)) {
      throw new ModelValidationError(
        `Duplicate ${entityName.toLowerCase()} temporary ID “${temporaryId}”.`
      );
    }
    if (!name) {
      throw new ModelValidationError(`${entityName} name cannot be empty.`);
    }
    temporaryIds.add(temporaryId);
    return { temporaryId, name };
  });
}

export function validateEventImportCategory(
  category: EventImportCategory | null
): EventImportCategory | null {
  if (!category || category.kind === 'existing') return category;
  const name = normalizeMetadataName(category.name);
  if (!name) throw new ModelValidationError('Category name cannot be empty.');
  if (!CATEGORY_COLOR_VALUES.includes(category.color)) {
    throw new ModelValidationError(
      `Invalid category color “${category.color}”.`
    );
  }
  return { ...category, name };
}

function validDate(value: LocalDate) {
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

function validTime(value: LocalTime) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validSignificance(
  value: EventSignificance
): value is EventSignificance {
  return EVENT_SIGNIFICANCE_VALUES.includes(value);
}
