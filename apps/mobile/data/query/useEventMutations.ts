import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateEventInput, UpdateEventInput } from '@/data/repositories';
import type { UUID } from '@/models';
import { useEventRepository } from '@/data/RepositoryProvider';
import {
  cacheEventDetails,
  invalidateEventLists,
  invalidateMetadataUsageLists,
} from './invalidation';
import { eventKeys } from './queryKeys';

export function useCreateEventMutation() {
  const repository = useEventRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateEventInput) => repository.create(input),
    onSuccess: async (details) => {
      cacheEventDetails(queryClient, details);
      await Promise.all([
        invalidateEventLists(queryClient),
        invalidateMetadataUsageLists(queryClient),
      ]);
    },
  });
}

export function useUpdateEventMutation() {
  const repository = useEventRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: UUID; input: UpdateEventInput }) =>
      repository.update(id, input),
    onSuccess: async (details) => {
      cacheEventDetails(queryClient, details);
      await Promise.all([
        invalidateEventLists(queryClient),
        invalidateMetadataUsageLists(queryClient),
      ]);
    },
  });
}

export function useDeleteEventMutation() {
  const repository = useEventRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: UUID) => repository.softDelete(id),
    onSuccess: async (_, id) => {
      queryClient.setQueryData(eventKeys.record(id), null);
      queryClient.setQueryData(eventKeys.detail(id), null);
      await Promise.all([
        invalidateEventLists(queryClient),
        invalidateMetadataUsageLists(queryClient),
      ]);
    },
  });
}

export function useRestoreEventMutation() {
  const repository = useEventRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: UUID) => repository.restore(id),
    onSuccess: async (_, id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: eventKeys.record(id) }),
        queryClient.invalidateQueries({ queryKey: eventKeys.detail(id) }),
        invalidateEventLists(queryClient),
        invalidateMetadataUsageLists(queryClient),
      ]);
    },
  });
}
