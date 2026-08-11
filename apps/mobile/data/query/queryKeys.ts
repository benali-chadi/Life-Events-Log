import type { EventListQuery, MetadataListQuery } from '@/data/repositories';
import type { UUID } from '@/models';

export type EventListQueryInput = Omit<EventListQuery, 'cursor'>;

function metadataKeys<const TScope extends string>(scope: TScope) {
  return {
    all: [scope] as const,
    lists: () => [scope, 'list'] as const,
    list: (query?: MetadataListQuery) => [scope, 'list', query ?? {}] as const,
    usageLists: () => [scope, 'usage-list'] as const,
    usageList: (query?: MetadataListQuery) =>
      [scope, 'usage-list', query ?? {}] as const,
    details: () => [scope, 'detail'] as const,
    detail: (id: UUID) => [scope, 'detail', id] as const,
  };
}

export const eventKeys = {
  all: ['events'] as const,
  lists: () => ['events', 'list'] as const,
  list: (query: EventListQueryInput) => ['events', 'list', query] as const,
  records: () => ['events', 'record'] as const,
  record: (id: UUID) => ['events', 'record', id] as const,
  details: () => ['events', 'detail'] as const,
  detail: (id: UUID) => ['events', 'detail', id] as const,
};

export const attachmentKeys = {
  all: ['attachments'] as const,
  lists: () => ['attachments', 'list'] as const,
  forEvent: (eventId: UUID) =>
    ['attachments', 'list', 'event', eventId] as const,
  details: () => ['attachments', 'detail'] as const,
  detail: (id: UUID) => ['attachments', 'detail', id] as const,
};

export const tagKeys = metadataKeys('tags');
export const categoryKeys = metadataKeys('categories');
export const personKeys = metadataKeys('people');
export const locationKeys = metadataKeys('locations');
