import { useQuery } from '@tanstack/react-query';
import type { MetadataListQuery } from '@/data/repositories';
import type { UUID } from '@/models';
import {
  useCategoryRepository,
  useLocationRepository,
  usePersonRepository,
  useTagRepository,
} from '@/data/RepositoryProvider';
import { categoryKeys, locationKeys, personKeys, tagKeys } from './queryKeys';

export function useTagQuery(id: UUID) {
  const repository = useTagRepository();

  return useQuery({
    queryKey: tagKeys.detail(id),
    queryFn: () => repository.getById(id),
  });
}

export function useTagsQuery(query?: MetadataListQuery) {
  const repository = useTagRepository();

  return useQuery({
    queryKey: tagKeys.list(query),
    queryFn: () => repository.list(query),
  });
}

export function useTagsWithUsageQuery(query?: MetadataListQuery) {
  const repository = useTagRepository();

  return useQuery({
    queryKey: tagKeys.usageList(query),
    queryFn: () => repository.listWithUsage(query),
  });
}

export function useCategoryQuery(id: UUID) {
  const repository = useCategoryRepository();

  return useQuery({
    queryKey: categoryKeys.detail(id),
    queryFn: () => repository.getById(id),
  });
}

export function useCategoriesQuery(query?: MetadataListQuery) {
  const repository = useCategoryRepository();

  return useQuery({
    queryKey: categoryKeys.list(query),
    queryFn: () => repository.list(query),
  });
}

export function useCategoriesWithUsageQuery(query?: MetadataListQuery) {
  const repository = useCategoryRepository();

  return useQuery({
    queryKey: categoryKeys.usageList(query),
    queryFn: () => repository.listWithUsage(query),
  });
}

export function usePersonQuery(id: UUID) {
  const repository = usePersonRepository();

  return useQuery({
    queryKey: personKeys.detail(id),
    queryFn: () => repository.getById(id),
  });
}

export function usePeopleQuery(query?: MetadataListQuery) {
  const repository = usePersonRepository();

  return useQuery({
    queryKey: personKeys.list(query),
    queryFn: () => repository.list(query),
  });
}

export function usePeopleWithUsageQuery(query?: MetadataListQuery) {
  const repository = usePersonRepository();

  return useQuery({
    queryKey: personKeys.usageList(query),
    queryFn: () => repository.listWithUsage(query),
  });
}

export function useLocationQuery(id: UUID) {
  const repository = useLocationRepository();

  return useQuery({
    queryKey: locationKeys.detail(id),
    queryFn: () => repository.getById(id),
  });
}

export function useLocationsQuery(query?: MetadataListQuery) {
  const repository = useLocationRepository();

  return useQuery({
    queryKey: locationKeys.list(query),
    queryFn: () => repository.list(query),
  });
}

export function useLocationsWithUsageQuery(query?: MetadataListQuery) {
  const repository = useLocationRepository();

  return useQuery({
    queryKey: locationKeys.usageList(query),
    queryFn: () => repository.listWithUsage(query),
  });
}
