import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  CreateCategoryInput,
  CreateNamedMetadataInput,
  SoftDeleteMetadataResult,
  UpdateCategoryInput,
  UpdateNamedMetadataInput,
} from '@/data/repositories';
import type { Category, Location, Person, Tag, UUID } from '@/models';
import {
  useCategoryRepository,
  useLocationRepository,
  usePersonRepository,
  useTagRepository,
} from '@/data/RepositoryProvider';
import {
  invalidateAffectedEvents,
  invalidateEmbeddedMetadata,
  invalidateMetadataLists,
} from './invalidation';
import { categoryKeys, locationKeys, personKeys, tagKeys } from './queryKeys';

type MetadataEntity = {
  id: UUID;
};

type MetadataRepository<TEntity, TCreateInput, TUpdateInput> = {
  create(input: TCreateInput): Promise<TEntity>;
  update(id: UUID, input: TUpdateInput): Promise<TEntity>;
};

type SoftDeleteMetadataRepository = {
  softDelete(id: UUID): Promise<SoftDeleteMetadataResult>;
};

type MetadataKeys = {
  lists(): QueryKey;
  usageLists(): QueryKey;
  detail(id: UUID): QueryKey;
};

function useCreateMetadataMutation<
  TEntity extends MetadataEntity,
  TCreateInput,
>(
  repository: Pick<MetadataRepository<TEntity, TCreateInput, never>, 'create'>,
  keys: MetadataKeys
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TCreateInput) => repository.create(input),
    onSuccess: async (entity) => {
      queryClient.setQueryData(keys.detail(entity.id), entity);
      await invalidateMetadataLists(queryClient, keys);
    },
  });
}

function useUpdateMetadataMutation<
  TEntity extends MetadataEntity,
  TUpdateInput,
>(
  repository: Pick<MetadataRepository<TEntity, never, TUpdateInput>, 'update'>,
  keys: MetadataKeys
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: UUID; input: TUpdateInput }) =>
      repository.update(id, input),
    onSuccess: async (entity) => {
      queryClient.setQueryData(keys.detail(entity.id), entity);
      await Promise.all([
        invalidateMetadataLists(queryClient, keys),
        invalidateEmbeddedMetadata(queryClient),
      ]);
    },
  });
}

function useSoftDeleteMetadataMutation(
  repository: SoftDeleteMetadataRepository,
  keys: MetadataKeys
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: UUID) => repository.softDelete(id),
    onSuccess: async (result, id) => {
      queryClient.setQueryData(keys.detail(id), null);
      await Promise.all([
        invalidateMetadataLists(queryClient, keys),
        invalidateAffectedEvents(queryClient, result.affectedEventIds),
      ]);

      return result;
    },
  });
}

export function useCreateTagMutation() {
  return useCreateMetadataMutation<Tag, CreateNamedMetadataInput>(
    useTagRepository(),
    tagKeys
  );
}

export function useUpdateTagMutation() {
  return useUpdateMetadataMutation<Tag, UpdateNamedMetadataInput>(
    useTagRepository(),
    tagKeys
  );
}

export function useDeleteTagMutation() {
  return useSoftDeleteMetadataMutation(useTagRepository(), tagKeys);
}

export function useCreateCategoryMutation() {
  return useCreateMetadataMutation<Category, CreateCategoryInput>(
    useCategoryRepository(),
    categoryKeys
  );
}

export function useUpdateCategoryMutation() {
  return useUpdateMetadataMutation<Category, UpdateCategoryInput>(
    useCategoryRepository(),
    categoryKeys
  );
}

export function useDeleteCategoryMutation() {
  return useSoftDeleteMetadataMutation(useCategoryRepository(), categoryKeys);
}

export function useCreatePersonMutation() {
  return useCreateMetadataMutation<Person, CreateNamedMetadataInput>(
    usePersonRepository(),
    personKeys
  );
}

export function useUpdatePersonMutation() {
  return useUpdateMetadataMutation<Person, UpdateNamedMetadataInput>(
    usePersonRepository(),
    personKeys
  );
}

export function useDeletePersonMutation() {
  return useSoftDeleteMetadataMutation(usePersonRepository(), personKeys);
}

export function useCreateLocationMutation() {
  return useCreateMetadataMutation<Location, CreateNamedMetadataInput>(
    useLocationRepository(),
    locationKeys
  );
}

export function useUpdateLocationMutation() {
  return useUpdateMetadataMutation<Location, UpdateNamedMetadataInput>(
    useLocationRepository(),
    locationKeys
  );
}

export function useDeleteLocationMutation() {
  return useSoftDeleteMetadataMutation(useLocationRepository(), locationKeys);
}
