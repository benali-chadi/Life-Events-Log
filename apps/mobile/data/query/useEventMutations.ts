import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CommitEventImportInput,
  CreateEventInput,
  UpdateEventInput,
} from '@/data/repositories';
import type { UUID } from '@/models';
import { useAttachmentStorageAccess } from '@/data/attachments/AttachmentStorageAccessProvider';
import {
  useEventImportRepository,
  useEventRepository,
} from '@/data/RepositoryProvider';
import {
  cacheEventDetails,
  invalidateConflicts,
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
        invalidateConflicts(queryClient),
        invalidateEventLists(queryClient),
        invalidateMetadataUsageLists(queryClient),
      ]);
    },
  });
}

export function useDeleteEventMutation() {
  const storageAccess = useAttachmentStorageAccess();
  const repository = useEventRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: UUID) => {
      await repository.softDelete(id);
      storageAccess.requestCleanup();
    },
    onSuccess: async (_, id) => {
      queryClient.setQueryData(eventKeys.record(id), null);
      queryClient.setQueryData(eventKeys.detail(id), null);
      await Promise.all([
        invalidateConflicts(queryClient),
        invalidateEventLists(queryClient),
        invalidateMetadataUsageLists(queryClient),
      ]);
    },
  });
}

export function useDeleteManyEventsMutation() {
  const storageAccess = useAttachmentStorageAccess();
  const repository = useEventRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: readonly UUID[]) => {
      await repository.softDeleteMany(ids);
      storageAccess.requestCleanup();
    },
    onSuccess: async (_, ids) => {
      ids.forEach((id) => {
        queryClient.setQueryData(eventKeys.record(id), null);
        queryClient.setQueryData(eventKeys.detail(id), null);
      });
      await Promise.all([
        invalidateConflicts(queryClient),
        invalidateEventLists(queryClient),
        invalidateMetadataUsageLists(queryClient),
      ]);
    },
  });
}
