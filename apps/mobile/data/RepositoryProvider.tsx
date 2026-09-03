import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type {
  AttachmentRepository,
  CategoryRepository,
  EventRepository,
  EventExportRepository,
  EventImportRepository,
  LocationRepository,
  PersonRepository,
  Repositories,
  TagRepository,
} from './repositories';

const RepositoryContext = createContext<Repositories | null>(null);

export function RepositoryProvider({
  children,
  repositories,
}: {
  children: ReactNode;
  repositories: Repositories;
}) {
  return (
    <RepositoryContext.Provider value={repositories}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepositories(): Repositories {
  const repositories = useContext(RepositoryContext);

  if (!repositories) {
    throw new Error('Repository hooks must be used inside RepositoryProvider.');
  }

  return repositories;
}

export function useEventRepository(): EventRepository {
  return useRepositories().events;
}

export function useEventImportRepository(): EventImportRepository {
  return useRepositories().eventImports;
}

export function useEventExportRepository(): EventExportRepository {
  return useRepositories().eventExports;
}

export function useAttachmentRepository(): AttachmentRepository {
  return useRepositories().attachments;
}

export function useTagRepository(): TagRepository {
  return useRepositories().tags;
}

export function useCategoryRepository(): CategoryRepository {
  return useRepositories().categories;
}

export function usePersonRepository(): PersonRepository {
  return useRepositories().people;
}

export function useLocationRepository(): LocationRepository {
  return useRepositories().locations;
}
