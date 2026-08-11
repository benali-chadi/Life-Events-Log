import type { AttachmentRepository } from './AttachmentRepository';
import type { EventRepository } from './EventRepository';
import type {
  CategoryRepository,
  LocationRepository,
  PersonRepository,
  TagRepository,
} from './MetadataRepositories';

export type Repositories = {
  events: EventRepository;
  attachments: AttachmentRepository;
  tags: TagRepository;
  categories: CategoryRepository;
  people: PersonRepository;
  locations: LocationRepository;
};
