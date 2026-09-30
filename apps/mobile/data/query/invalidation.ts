import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { EventDetails, UUID } from '@/models';
import {
  categoryKeys,
  conflictKeys,
  eventKeys,
  locationKeys,
  personKeys,
  tagKeys,
} from './queryKeys';

type MetadataListKeys = {
  lists(): QueryKey;
  usageLists(): QueryKey;
};

export function invalidateConflicts(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: conflictKeys.all });
}

/** Also refresh on already-resolved: another edit may have removed the row. */
export function invalidateConflictResolution(queryClient: QueryClient) {
  return Promise.all([
    invalidateConflicts(queryClient),
    ...[eventKeys, categoryKeys, tagKeys, personKeys, locationKeys].map(
      (keys) => queryClient.invalidateQueries({ queryKey: keys.all })
    ),
  ]);
}

export function cacheEventDetails(
  queryClient: QueryClient,
  details: EventDetails
) {
  queryClient.setQueryData(eventKeys.record(details.event.id), details.event);
  queryClient.setQueryData(eventKeys.detail(details.event.id), details);
}

export function invalidateEventLists(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: eventKeys.lists() });
}

export function invalidateEventDetails(
  queryClient: QueryClient,
  eventId: UUID
) {
  return queryClient.invalidateQueries({
    queryKey: eventKeys.detail(eventId),
  });
}

export function invalidateAffectedEvents(
  queryClient: QueryClient,
  eventIds: readonly UUID[]
) {
  if (eventIds.length === 0) return Promise.resolve([]);

  return Promise.all([
    ...eventIds.flatMap((eventId) => [
      queryClient.invalidateQueries({ queryKey: eventKeys.record(eventId) }),
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) }),
    ]),
    invalidateEventLists(queryClient),
  ]);
}

export function invalidateMetadataLists(
  queryClient: QueryClient,
  keys: MetadataListKeys
) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.lists() }),
    queryClient.invalidateQueries({ queryKey: keys.usageLists() }),
  ]);
}

export function invalidateMetadataUsageLists(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: tagKeys.usageLists() }),
    queryClient.invalidateQueries({ queryKey: categoryKeys.usageLists() }),
    queryClient.invalidateQueries({ queryKey: personKeys.usageLists() }),
    queryClient.invalidateQueries({ queryKey: locationKeys.usageLists() }),
  ]);
}

export function invalidateEmbeddedMetadata(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: eventKeys.details() }),
    invalidateEventLists(queryClient),
  ]);
}
