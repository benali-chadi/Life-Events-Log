import { useMemo } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createDrizzleDatabase } from '../sqlite/database';
import {
  createConflictService,
  type ConflictEntityType,
  type ConflictChoice,
} from '../sqlite/sync/conflicts/createConflictService';
import { conflictKeys } from './queryKeys';
import { invalidateConflictResolution } from './invalidation';

function useConflictService() {
  const sqlite = useSQLiteContext();
  return useMemo(
    () =>
      createConflictService(createDrizzleDatabase(sqlite), {
        now: () => new Date().toISOString(),
      }),
    [sqlite]
  );
}

export function useEntityConflictsQuery(
  entityType: ConflictEntityType,
  entityId: string
) {
  const service = useConflictService();
  return useQuery({
    queryKey: conflictKeys.entity(entityType, entityId),
    queryFn: () => service.getConflicts(entityType, entityId),
  });
}

export function useResolveConflictMutation() {
  const service = useConflictService();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conflictId,
      choice,
    }: {
      conflictId: string;
      choice: ConflictChoice;
    }) => service.resolveConflict(conflictId, choice),
    onSuccess: () => invalidateConflictResolution(queryClient),
  });
}

export function useMetadataConflictsQuery(
  entityType: Exclude<ConflictEntityType, 'event'>
) {
  const service = useConflictService();
  return useQuery({
    queryKey: conflictKeys.type(entityType),
    queryFn: () => service.getConflicts(entityType),
  });
}
