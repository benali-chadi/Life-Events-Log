import type { CreateOperationInput, Operation } from './types';
import { hashOperationContent } from './utils/hashOperationContent';

export const DEFAULTS_ORIGIN = 'LEL-defaults';
const timestamp = '2026-08-19T00:00:00.000Z';
// Published protocol history: never edit/reorder existing entries. Append only.
// These first six entries match the historical seed_defaults SQL migration.
const definitions: readonly CreateOperationInput[] = [
  {
    operationType: 'entity.create',
    entityType: 'category',
    entityId: '148d67ea-a892-412c-8293-4f469621ba43',
    payload: {
      name: 'Personal',
      color: 'magenta',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  {
    operationType: 'entity.create',
    entityType: 'category',
    entityId: '237ef166-7b37-43f7-b7d5-6bb453d88259',
    payload: {
      name: 'Work',
      color: 'blue',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  {
    operationType: 'entity.create',
    entityType: 'category',
    entityId: '5c92cef4-26c0-49cf-837f-ff90cb46a0a5',
    payload: {
      name: 'Travel',
      color: 'green',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  },
  {
    operationType: 'entity.create',
    entityType: 'tag',
    entityId: '24a52b26-c31f-432d-b7d2-05b1afe55441',
    payload: { name: 'Health', createdAt: timestamp, updatedAt: timestamp },
  },
  {
    operationType: 'entity.create',
    entityType: 'tag',
    entityId: '855fbb4f-3131-48d4-afe1-ed611e366786',
    payload: { name: 'Studies', createdAt: timestamp, updatedAt: timestamp },
  },
  {
    operationType: 'entity.create',
    entityType: 'tag',
    entityId: 'ed8f910d-c4cd-45d7-9c09-dfa67d14788f',
    payload: { name: 'Family', createdAt: timestamp, updatedAt: timestamp },
  },
];

/** Fresh objects so callers cannot mutate the shared history. */
export function defaultOperations(): Operation[] {
  return definitions.map((definition, index) => {
    const content = {
      ...definition,
      payload: { ...definition.payload },
      originDeviceId: DEFAULTS_ORIGIN,
      originSequence: index + 1,
      lamport: index + 1,
      causalContext: index === 0 ? {} : { [DEFAULTS_ORIGIN]: index },
    } as Omit<Operation, 'operationHash'>;
    return {
      ...content,
      operationHash: hashOperationContent(content),
    } as Operation;
  });
}
