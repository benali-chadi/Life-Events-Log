import {
  EVENT_SIGNIFICANCE_VALUES,
  EVENT_TITLE_MAX_LENGTH,
  CATEGORY_COLOR_VALUES,
  type EventSignificance,
} from '@/models';
import { ModelValidationError } from './errors';
import type {
  EventImportEventInput,
  EventImportCategory,
  NewEventImportMetadata,
} from './EventImportRepository';
import { normalizeMetadataName } from './metadataName';
import { isValidLocalDate, isValidLocalTime } from '@/models/validation';

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
  if (!isValidLocalDate(input.date)) {
    throw new ModelValidationError(`Invalid event date “${input.date}”.`);
  }
  if (input.time !== null && !isValidLocalTime(input.time)) {
    throw new ModelValidationError(`Invalid event time “${input.time}”.`);
  }
  if (!validSignificance(input.significance)) {
    throw new ModelValidationError(
      `Invalid event significance “${input.significance}”.`
    );
  }
  return {
    ...input,
    title,
    category: validateEventImportCategory(input.category),
  };
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

function validSignificance(
  value: EventSignificance
): value is EventSignificance {
  return EVENT_SIGNIFICANCE_VALUES.includes(value);
}
