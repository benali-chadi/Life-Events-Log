import type { QueryClient } from '@tanstack/react-query';
import type { EventDetails, UUID } from '@/models';
import { eventKeys } from './queryKeys';

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

export function invalidateEmbeddedMetadata(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: eventKeys.details() }),
    invalidateEventLists(queryClient),
  ]);
}
