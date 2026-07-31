import { useQuery } from '@tanstack/react-query';
import type { UUID } from '@/models';
import { useAttachmentRepository } from '@/data/RepositoryProvider';
import { attachmentKeys } from './queryKeys';

export function useAttachmentQuery(id: UUID) {
  const repository = useAttachmentRepository();

  return useQuery({
    queryKey: attachmentKeys.detail(id),
    queryFn: () => repository.getById(id),
  });
}

export function useEventAttachmentsQuery(eventId: UUID) {
  const repository = useAttachmentRepository();

  return useQuery({
    queryKey: attachmentKeys.forEvent(eventId),
    queryFn: () => repository.listForEvent(eventId),
  });
}
