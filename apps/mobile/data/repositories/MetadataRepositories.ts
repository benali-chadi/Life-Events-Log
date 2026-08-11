import type {
  Category,
  CategoryColor,
  Location,
  Person,
  Tag,
  UUID,
} from '@/models';

export type MetadataListQuery = {
  search?: string;
};

export type CreateNamedMetadataInput = {
  name: string;
};

export type UpdateNamedMetadataInput = {
  name: string;
};

export type DeleteMetadataResult = {
  affectedEventIds: UUID[];
};

export type MetadataUsageItem<TEntity> = {
  metadata: TEntity;
  eventCount: number;
};

export interface NamedMetadataRepository<TEntity> {
  getById(id: UUID): Promise<TEntity | null>;
  list(query?: MetadataListQuery): Promise<TEntity[]>;
  listWithUsage(
    query?: MetadataListQuery
  ): Promise<MetadataUsageItem<TEntity>[]>;
  create(input: CreateNamedMetadataInput): Promise<TEntity>;
  update(id: UUID, input: UpdateNamedMetadataInput): Promise<TEntity>;
  delete(id: UUID): Promise<DeleteMetadataResult>;
}

export type TagRepository = NamedMetadataRepository<Tag>;
export type PersonRepository = NamedMetadataRepository<Person>;
export type LocationRepository = NamedMetadataRepository<Location>;

export type CreateCategoryInput = {
  name: string;
  color: CategoryColor;
};

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

export interface CategoryRepository {
  getById(id: UUID): Promise<Category | null>;
  list(query?: MetadataListQuery): Promise<Category[]>;
  listWithUsage(
    query?: MetadataListQuery
  ): Promise<MetadataUsageItem<Category>[]>;
  create(input: CreateCategoryInput): Promise<Category>;
  update(id: UUID, input: UpdateCategoryInput): Promise<Category>;
  delete(id: UUID): Promise<DeleteMetadataResult>;
}
