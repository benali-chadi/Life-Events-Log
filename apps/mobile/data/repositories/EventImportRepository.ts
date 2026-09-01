import type { UUID } from '@/models';
import type { CreateEventInput } from './EventRepository';

export type EventImportMetadataReference =
  { kind: 'existing'; id: UUID } | { kind: 'new'; temporaryId: string };

export type NewEventImportMetadata = {
  temporaryId: string;
  name: string;
};

export type EventImportEventInput = Omit<
  CreateEventInput,
  'categoryId' | 'locationId' | 'tagIds' | 'peopleIds'
> & {
  tags: readonly EventImportMetadataReference[];
  people: readonly EventImportMetadataReference[];
  location: EventImportMetadataReference | null;
};

export type CommitEventImportInput = {
  categoryId: UUID | null;
  events: readonly EventImportEventInput[];
  newMetadata: {
    tags: readonly NewEventImportMetadata[];
    people: readonly NewEventImportMetadata[];
    locations: readonly NewEventImportMetadata[];
  };
};

export type CommitEventImportResult = {
  eventCount: number;
  createdMetadata: {
    tagCount: number;
    peopleCount: number;
    locationCount: number;
  };
};

export interface EventImportRepository {
  commit(input: CommitEventImportInput): Promise<CommitEventImportResult>;
}
