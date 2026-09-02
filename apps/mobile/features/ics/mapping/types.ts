import type {
  CreateEventInput,
  NewEventImportMetadata,
} from '@/data/repositories';
import type { Location, Person, Tag } from '@/models';

export type IcsImportMetadataSnapshot = {
  tags: readonly Tag[];
  people: readonly Person[];
  locations: readonly Location[];
};

export type NewIcsImportMetadata = NewEventImportMetadata;

export type IcsImportMetadataReference<TEntity> =
  | { kind: 'existing'; entity: TEntity }
  | { kind: 'new'; metadata: NewIcsImportMetadata };

export type IcsImportWarningCode =
  'missing-title' | 'title-truncated' | 'attendee-name-missing';

export type IcsImportWarning = {
  code: IcsImportWarningCode;
  message: string;
};

export type IcsImportSkipReason =
  'cancelled' | 'missing-start' | 'invalid-start';

export type SkippedIcsImportEvent = {
  sourceIndex: number;
  uid: string | null;
  title: string | null;
  reason: IcsImportSkipReason;
};

export type IcsImportCandidate = {
  id: string;
  event: Omit<
    CreateEventInput,
    'categoryId' | 'locationId' | 'tagIds' | 'peopleIds'
  >;
  tags: IcsImportMetadataReference<Tag>[];
  people: IcsImportMetadataReference<Person>[];
  location: IcsImportMetadataReference<Location> | null;
  source: {
    sourceIndex: number;
    uid: string | null;
    timezone: string;
    recurring: boolean;
  };
  warnings: IcsImportWarning[];
};

export type IcsImportMappingResult = {
  candidates: IcsImportCandidate[];
  newMetadata: {
    tags: NewIcsImportMetadata[];
    people: NewIcsImportMetadata[];
    locations: NewIcsImportMetadata[];
  };
  skipped: SkippedIcsImportEvent[];
};
