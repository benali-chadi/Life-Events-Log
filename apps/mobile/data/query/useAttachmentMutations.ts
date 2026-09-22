import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { CreateAttachmentInput } from '@/data/repositories';
import type { UUID } from '@/models';
import { useAttachmentRepository } from '@/data/RepositoryProvider';
import { copyAttachmentIntoStorage } from '@/data/attachments';
import { useAttachmentStorageAccess } from '@/data/attachments/AttachmentStorageAccessProvider';
import { invalidateEventDetails, invalidateEventLists } from './invalidation';
import { attachmentKeys } from './queryKeys';

type AttachmentIdentity = {
  id: UUID;
  eventId: UUID;
};

async function invalidateAttachmentEvent(
  queryClient: QueryClient,
  eventId: UUID
) {
  await Promise.all([
    invalidateEventDetails(queryClient, eventId),
    invalidateEventLists(queryClient),
  ]);
}

export function useCreateAttachmentMutation() {
  const storageAccess = useAttachmentStorageAccess();
  const repository = useAttachmentRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAttachmentInput) =>
      storageAccess.withAccess(() => repository.create(input)),
    onSuccess: async (attachment) => {
      queryClient.setQueryData(
        attachmentKeys.detail(attachment.id),
        attachment
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.forEvent(attachment.eventId),
        }),
        invalidateAttachmentEvent(queryClient, attachment.eventId),
      ]);
    },
  });
}

export function useImportAttachmentMutation() {
  const storageAccess = useAttachmentStorageAccess();
  const repository = useAttachmentRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceUri,
      ...input
    }: Omit<CreateAttachmentInput, 'contentHash'> & { sourceUri: string }) =>
      storageAccess.withAccess(async () => {
        const storedFile = await copyAttachmentIntoStorage({
          sourceUri,
          filename: input.filename,
          mimeType: input.mimeType,
        });

        return await repository.create({
          ...input,
          contentHash: storedFile.contentHash,
        });
      }),
    onSuccess: async (attachment) => {
      queryClient.setQueryData(
        attachmentKeys.detail(attachment.id),
        attachment
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.forEvent(attachment.eventId),
        }),
        invalidateAttachmentEvent(queryClient, attachment.eventId),
      ]);
    },
  });
}

export function useReorderAttachmentsMutation() {
  const repository = useAttachmentRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      eventId,
      attachmentIds,
    }: {
      eventId: UUID;
      attachmentIds: readonly UUID[];
    }) => repository.reorder(eventId, attachmentIds),
    onSuccess: async (attachments, { eventId }) => {
      queryClient.setQueryData(attachmentKeys.forEvent(eventId), attachments);

      for (const attachment of attachments) {
        queryClient.setQueryData(
          attachmentKeys.detail(attachment.id),
          attachment
        );
      }

      await invalidateAttachmentEvent(queryClient, eventId);
    },
  });
}

export function useDeleteAttachmentMutation() {
  const storageAccess = useAttachmentStorageAccess();
  const repository = useAttachmentRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: AttachmentIdentity) => {
      await repository.softDelete(id);
      storageAccess.requestCleanup();
    },
    onSuccess: async (_, { id, eventId }) => {
      queryClient.setQueryData(attachmentKeys.detail(id), null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.forEvent(eventId),
        }),
        invalidateAttachmentEvent(queryClient, eventId),
      ]);
    },
  });
}

export function useDeleteManyAttachmentsMutation() {
  const storageAccess = useAttachmentStorageAccess();
  const repository = useAttachmentRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids }: { ids: readonly UUID[]; eventId: UUID }) => {
      await repository.softDeleteMany(ids);
      storageAccess.requestCleanup();
    },
    onSuccess: async (_, { ids, eventId }) => {
      ids.forEach((id) =>
        queryClient.setQueryData(attachmentKeys.detail(id), null)
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.forEvent(eventId),
        }),
        invalidateAttachmentEvent(queryClient, eventId),
      ]);
    },
  });
}

export function useRestoreAttachmentMutation() {
  const storageAccess = useAttachmentStorageAccess();
  const repository = useAttachmentRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: AttachmentIdentity) =>
      storageAccess.withAccess(() => repository.restore(id)),
    onSuccess: async (_, { id, eventId }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.detail(id),
        }),
        queryClient.invalidateQueries({
          queryKey: attachmentKeys.forEvent(eventId),
        }),
        invalidateAttachmentEvent(queryClient, eventId),
      ]);
    },
  });
}
