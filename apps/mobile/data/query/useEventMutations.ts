import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CommitEventImportInput,
  CreateEventInput,
  UpdateEventInput,
} from '@/data/repositories';
import type { UUID } from '@/models';
import {
  useEventImportRepository,
  useEventRepository,
} from '@/data/RepositoryProvider';
import {
  cacheEventDetails,
  invalidateEventLists,
  invalidateMetadataLists,
  invalidateMetadataUsageLists,
} from './invalidation';
import {
  categoryKeys,
  eventKeys,
  locationKeys,
  personKeys,
  tagKeys,
} from './queryKeys';

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

export function useCommitEventImportMutation() {
  const repository = useEventImportRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CommitEventImportInput) => repository.commit(input),
    onSuccess: async (result) => {
      await Promise.all([
        invalidateEventLists(queryClient),
        invalidateMetadataUsageLists(queryClient),
        result.createdMetadata.categoryCount > 0
          ? invalidateMetadataLists(queryClient, categoryKeys)
          : Promise.resolve(),
        result.createdMetadata.tagCount > 0
          ? invalidateMetadataLists(queryClient, tagKeys)
          : Promise.resolve(),
        result.createdMetadata.peopleCount > 0
          ? invalidateMetadataLists(queryClient, personKeys)
          : Promise.resolve(),
        result.createdMetadata.locationCount > 0
          ? invalidateMetadataLists(queryClient, locationKeys)
          : Promise.resolve(),
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

export function useDeleteManyEventsMutation() {
  const repository = useEventRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: readonly UUID[]) => repository.softDeleteMany(ids),
    onSuccess: async (_, ids) => {
      ids.forEach((id) => {
        queryClient.setQueryData(eventKeys.record(id), null);
        queryClient.setQueryData(eventKeys.detail(id), null);
      });
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

export function useRestoreManyEventsMutation() {
  const repository = useEventRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: readonly UUID[]) =>
      Promise.all(ids.map((id) => repository.restore(id))),
    onSuccess: async (_, ids) => {
      await Promise.all([
        ...ids.flatMap((id) => [
          queryClient.invalidateQueries({ queryKey: eventKeys.record(id) }),
          queryClient.invalidateQueries({ queryKey: eventKeys.detail(id) }),
        ]),
        invalidateEventLists(queryClient),
        invalidateMetadataUsageLists(queryClient),
      ]);
    },
  });
}
