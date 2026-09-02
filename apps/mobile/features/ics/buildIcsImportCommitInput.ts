import type {
  CommitEventImportInput,
  EventImportCategory,
  EventImportMetadataReference,
} from '@/data/repositories';
import type {
  IcsImportCandidate,
  IcsImportMappingResult,
  IcsImportMetadataReference,
} from './types';

export function buildIcsImportCommitInput(
  mapping: IcsImportMappingResult,
  selectedCandidateIds: ReadonlySet<string>,
  category: EventImportCategory | null
): CommitEventImportInput {
  const selected = mapping.candidates.filter((candidate) =>
    selectedCandidateIds.has(candidate.id)
  );
  const referencedTemporaryIds = {
    tags: new Set<string>(),
    people: new Set<string>(),
    locations: new Set<string>(),
  };

  const events = selected.map((candidate) => ({
    ...candidate.event,
    tags: candidate.tags.map((reference) =>
      commitReference(reference, referencedTemporaryIds.tags)
    ),
    people: candidate.people.map((reference) =>
      commitReference(reference, referencedTemporaryIds.people)
    ),
    location: candidate.location
      ? commitReference(candidate.location, referencedTemporaryIds.locations)
      : null,
  }));

  return {
    category,
    events,
    newMetadata: {
      tags: mapping.newMetadata.tags.filter((metadata) =>
        referencedTemporaryIds.tags.has(metadata.temporaryId)
      ),
      people: mapping.newMetadata.people.filter((metadata) =>
        referencedTemporaryIds.people.has(metadata.temporaryId)
      ),
      locations: mapping.newMetadata.locations.filter((metadata) =>
        referencedTemporaryIds.locations.has(metadata.temporaryId)
      ),
    },
  };
}

function commitReference<TEntity extends { id: string }>(
  reference: IcsImportMetadataReference<TEntity>,
  referencedTemporaryIds: Set<string>
): EventImportMetadataReference {
  if (reference.kind === 'existing') {
    return { kind: 'existing', id: reference.entity.id };
  }
  referencedTemporaryIds.add(reference.metadata.temporaryId);
  return { kind: 'new', temporaryId: reference.metadata.temporaryId };
}

export function selectedWarningCount(
  candidates: readonly IcsImportCandidate[],
  selectedCandidateIds: ReadonlySet<string>
) {
  let count = 0;
  for (const candidate of candidates) {
    if (selectedCandidateIds.has(candidate.id)) {
      count += candidate.warnings.length;
    }
  }
  return count;
}
