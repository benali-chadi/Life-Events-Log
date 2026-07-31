import {
  useMutation,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type {
  CreateCategoryInput,
  CreateNamedMetadataInput,
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
import { invalidateEmbeddedMetadata } from './invalidation';
import { categoryKeys, locationKeys, personKeys, tagKeys } from './queryKeys';

type MetadataEntity = {
  id: UUID;
};

type MetadataRepository<TEntity, TCreateInput, TUpdateInput> = {
  create(input: TCreateInput): Promise<TEntity>;
  update(id: UUID, input: TUpdateInput): Promise<TEntity>;
  softDelete(id: UUID): Promise<void>;
  restore(id: UUID): Promise<void>;
};

type MetadataKeys = {
  lists(): QueryKey;
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
      await queryClient.invalidateQueries({ queryKey: keys.lists() });
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
        queryClient.invalidateQueries({ queryKey: keys.lists() }),
        invalidateEmbeddedMetadata(queryClient),
      ]);
    },
  });
}

function useDeleteMetadataMutation<TEntity>(
  repository: Pick<MetadataRepository<TEntity, never, never>, 'softDelete'>,
  keys: MetadataKeys
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: UUID) => repository.softDelete(id),
    onSuccess: async (_, id) => {
      queryClient.setQueryData(keys.detail(id), null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.lists() }),
        invalidateEmbeddedMetadata(queryClient),
      ]);
    },
  });
}

function useRestoreMetadataMutation<TEntity>(
  repository: Pick<MetadataRepository<TEntity, never, never>, 'restore'>,
  keys: MetadataKeys
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: UUID) => repository.restore(id),
    onSuccess: async (_, id) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.detail(id) }),
        queryClient.invalidateQueries({ queryKey: keys.lists() }),
        invalidateEmbeddedMetadata(queryClient),
      ]);
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
  return useDeleteMetadataMutation(useTagRepository(), tagKeys);
}

export function useRestoreTagMutation() {
  return useRestoreMetadataMutation(useTagRepository(), tagKeys);
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
  return useDeleteMetadataMutation(useCategoryRepository(), categoryKeys);
}

export function useRestoreCategoryMutation() {
  return useRestoreMetadataMutation(useCategoryRepository(), categoryKeys);
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
  return useDeleteMetadataMutation(usePersonRepository(), personKeys);
}

export function useRestorePersonMutation() {
  return useRestoreMetadataMutation(usePersonRepository(), personKeys);
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
  return useDeleteMetadataMutation(useLocationRepository(), locationKeys);
}

export function useRestoreLocationMutation() {
  return useRestoreMetadataMutation(useLocationRepository(), locationKeys);
}
