import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query';
import type { UUID } from '@/models';
import { useEventRepository } from '@/data/RepositoryProvider';
import { eventKeys, type EventListQueryInput } from './queryKeys';

export function useEventQuery(id: UUID) {
  const repository = useEventRepository();

  return useQuery({
    queryKey: eventKeys.record(id),
    queryFn: () => repository.getById(id),
  });
}

export function useEventDetailsQuery(id: UUID) {
  const repository = useEventRepository();

  return useQuery({
    queryKey: eventKeys.detail(id),
    queryFn: () => repository.getDetailsById(id),
  });
}

export function useInfiniteEventListQuery(query: EventListQueryInput) {
  const repository = useEventRepository();

  return useInfiniteQuery({
    queryKey: eventKeys.list(query),
    queryFn: ({ pageParam }) =>
      repository.list({
        ...query,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export function useEventCountQuery(query: EventListQueryInput) {
  const repository = useEventRepository();

  return useQuery({
    queryKey: eventKeys.count(query),
    queryFn: () => repository.count(query),
    placeholderData: keepPreviousData,
  });
}
