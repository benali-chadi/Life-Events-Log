import { describe, expect, it } from 'vitest';
import type { IcsImportMappingResult } from './types';
import { buildIcsImportCommitInput } from './buildIcsImportCommitInput';

describe('buildIcsImportCommitInput', () => {
  it('includes selected events and only their proposed metadata', () => {
    const mapping = mappingResult();

    const result = buildIcsImportCommitInput(mapping, new Set(['first']), {
      kind: 'new',
      name: 'Imported',
      color: 'blue',
    });

    expect(result.category).toEqual({
      kind: 'new',
      name: 'Imported',
      color: 'blue',
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.tags).toEqual([
      { kind: 'new', temporaryId: 'tag-one' },
    ]);
    expect(result.newMetadata.tags).toEqual([
      { temporaryId: 'tag-one', name: 'One' },
    ]);
    expect(result.newMetadata.people).toEqual([]);
  });
});

function mappingResult(): IcsImportMappingResult {
  const baseEvent = {
    title: 'Event',
    date: '2026-09-01' as const,
    time: null,
    notes: '',
    significance: 'ordinary' as const,
  };
  const source = {
    sourceIndex: 0,
    uid: null,
    timezone: 'floating',
    recurring: false,
  };
  return {
    candidates: [
      {
        id: 'first',
        event: baseEvent,
        tags: [
          {
            kind: 'new',
            metadata: { temporaryId: 'tag-one', name: 'One' },
          },
        ],
        people: [],
        location: null,
        source,
        warnings: [],
      },
      {
        id: 'second',
        event: baseEvent,
        tags: [],
        people: [
          {
            kind: 'new',
            metadata: { temporaryId: 'person-two', name: 'Two' },
          },
        ],
        location: null,
        source: { ...source, sourceIndex: 1 },
        warnings: [],
      },
    ],
    newMetadata: {
      tags: [{ temporaryId: 'tag-one', name: 'One' }],
      people: [{ temporaryId: 'person-two', name: 'Two' }],
      locations: [],
    },
    skipped: [],
  };
}
