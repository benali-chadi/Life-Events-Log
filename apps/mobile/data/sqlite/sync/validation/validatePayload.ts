import {
  CATEGORY_COLOR_VALUES,
  EVENT_SIGNIFICANCE_VALUES,
  EVENT_TITLE_MAX_LENGTH,
} from '@/models';
import { normalizeMetadataName } from '@/data/repositories/metadataName';
import type {
  CreateOperationInput,
  OperationType,
  SyncEntityType,
} from '../types';
import {
  isValidLocalDate,
  isValidLocalTime,
  isValidTimestamp,
} from '@/models/validation';
import {
  record,
  identifier as id,
  counter,
  validationError as fail,
} from './helpers';

type Candidate = Omit<CreateOperationInput, 'payload'> & { payload: unknown };
type Rule = (value: unknown, path: string) => void;
type Shape = Record<string, Rule>;
const string: Rule = (value, path) => {
  if (typeof value !== 'string') fail(path, 'must be a string');
};
const name: Rule = (value, path) => {
  id(value, path);
  if (normalizeMetadataName(value as string) !== value)
    fail(path, 'must already have normalized whitespace');
};
const nullable =
  (rule: Rule): Rule =>
  (value, path) => {
    if (value !== null) rule(value, path);
  };
const integer =
  (minimum: number): Rule =>
  (value, path) =>
    counter(value, path, minimum);
const enumeration =
  (values: readonly string[]): Rule =>
  (value, path) => {
    if (typeof value !== 'string' || !values.includes(value))
      fail(path, 'unsupported value');
  };
const date: Rule = (value, path) => {
  if (!isValidLocalDate(value)) fail(path, 'must be a valid YYYY-MM-DD date');
};
const timestamp: Rule = (value, path) => {
  if (!isValidTimestamp(value))
    fail(path, 'must be a valid UTC ISO timestamp with milliseconds');
};
const eventFields: Shape = {
  title(value, path) {
    name(value, path);
    if ((value as string).length > EVENT_TITLE_MAX_LENGTH)
      fail(path, `exceeds ${EVENT_TITLE_MAX_LENGTH} characters`);
  },
  date,
  time: nullable((value, path) => {
    if (!isValidLocalTime(value)) fail(path, 'must be HH:mm');
  }),
  significance: enumeration(EVENT_SIGNIFICANCE_VALUES),
  categoryId: nullable(id),
  locationId: nullable(id),
  notes: string,
};
const timestamps: Shape = { createdAt: timestamp, updatedAt: timestamp };
const metadataFields: Shape = { name };
const categoryFields: Shape = {
  name,
  color: enumeration(CATEGORY_COLOR_VALUES),
};

function shape(
  value: unknown,
  fields: Shape,
  path = 'payload',
  partial = false
): void {
  const input = record(value, path);
  const keys = Object.keys(input);
  if (partial && keys.length === 0)
    fail(path, 'must contain at least one change');
  for (const key of keys)
    if (!Object.hasOwn(fields, key))
      fail(`${path}.${key}`, 'unsupported field');
  for (const [key, rule] of Object.entries(fields)) {
    if (!Object.hasOwn(input, key)) {
      if (!partial) fail(`${path}.${key}`, 'required field');
    } else rule(input[key], `${path}.${key}`);
  }
}
function entityFields(entity: SyncEntityType): Shape {
  if (entity === 'event') return eventFields;
  if (entity === 'category') return categoryFields;
  if (['tag', 'person', 'location'].includes(entity)) return metadataFields;
  return fail('entityType', 'unsupported entity operation');
}

/** Validates pending or sealed payloads without coercion or database/file lookups.
 * Sealed-operation integrity checks belong to validateOperation.
 */
export function validatePayload(
  operation: Candidate
): asserts operation is CreateOperationInput {
  const { payload, entityType, operationType } = operation;
  switch (operationType) {
    case 'entity.create':
      shape(payload, { ...entityFields(entityType), ...timestamps });
      return;
    case 'entity.patch':
      shape(payload, {
        changes: (value, path) =>
          shape(value, entityFields(entityType), path, true),
        updatedAt: timestamp,
      });
      return;
    case 'entity.delete':
      entityFields(entityType);
      shape(payload, { deletedAt: timestamp });
      return;
    case 'attachment.delete':
      requireEntity(entityType, 'attachment', operationType);
      shape(payload, { deletedAt: timestamp });
      return;
    case 'relation.add':
    case 'relation.remove': {
      if (entityType !== 'event_tag' && entityType !== 'event_person')
        fail('entityType', 'unsupported relation');
      const endpoint = entityType === 'event_tag' ? 'tagId' : 'personId';
      shape(payload, {
        eventId: id,
        [endpoint]: id,
        ...(operationType === 'relation.add'
          ? timestamps
          : { deletedAt: timestamp }),
      });
      const relation = payload as Record<string, unknown>;
      if (
        operation.entityId !==
        JSON.stringify([relation.eventId, relation[endpoint]])
      )
        fail('entityId', 'must match the canonical relation endpoints');
      return;
    }
    case 'attachment.create':
      requireEntity(entityType, 'attachment', operationType);
      shape(payload, {
        eventId: id,
        contentHash(value, path) {
          if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value))
            fail(path, 'must be a lowercase SHA-256 digest');
        },
        filename(value, path) {
          id(value, path);
          if ((value as string).trim() !== value)
            fail(path, 'must already be trimmed');
        },
        // Retain the current repository contract until an image MIME policy is agreed.
        mimeType: nullable((value, path) => {
          id(value, path);
          if ((value as string).trim().toLowerCase() !== value)
            fail(path, 'must already be trimmed and lowercase');
        }),
        width: nullable(integer(1)),
        height: nullable(integer(1)),
        fileSize: nullable(integer(0)),
        sortOrder: integer(0),
        ...timestamps,
      });
      return;
    case 'event.attachment.reorder':
      requireEntity(entityType, 'event', operationType);
      shape(payload, {
        orderedAttachmentIds(value, path) {
          if (!Array.isArray(value)) fail(path, 'must be an array');
          const ids = value as unknown[];
          for (let i = 0; i < ids.length; i++) id(ids[i], `${path}[${i}]`);
          if (new Set(ids).size !== ids.length)
            fail(path, 'contains duplicate IDs');
        },
        updatedAt: timestamp,
      });
      return;
    default:
      fail('operationType', 'unsupported operation');
  }
}
function requireEntity(
  actual: SyncEntityType,
  expected: SyncEntityType,
  type: OperationType
) {
  if (actual !== expected) fail('entityType', `unsupported target for ${type}`);
}
