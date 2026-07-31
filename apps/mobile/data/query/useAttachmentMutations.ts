import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { CreateAttachmentInput } from '@/data/repositories';
import type { UUID } from '@/models';
import { useAttachmentRepository } from '@/data/RepositoryProvider';
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
  const repository = useAttachmentRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAttachmentInput) => repository.create(input),
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
  const repository = useAttachmentRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: AttachmentIdentity) => repository.softDelete(id),
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

export function useRestoreAttachmentMutation() {
  const repository = useAttachmentRepository();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: AttachmentIdentity) => repository.restore(id),
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
