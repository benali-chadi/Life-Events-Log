import type { AttachmentRepository } from './AttachmentRepository';
import type { EventRepository } from './EventRepository';
import type { EventImportRepository } from './EventImportRepository';
import type {
  CategoryRepository,
  LocationRepository,
  PersonRepository,
  TagRepository,
} from './MetadataRepositories';

export type Repositories = {
  events: EventRepository;
  eventImports: EventImportRepository;
  attachments: AttachmentRepository;
  tags: TagRepository;
  categories: CategoryRepository;
  people: PersonRepository;
  locations: LocationRepository;
};
