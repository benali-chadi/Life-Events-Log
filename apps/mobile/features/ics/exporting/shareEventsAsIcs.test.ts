import { describe, expect, it, vi } from 'vitest';
import type { EventDetails } from '@/models';

import {
  shareEventsAsIcs,
  type IcsExportCoordinatorDependencies,
} from './shareEventsAsIcs';

vi.mock('expo-crypto', () => ({ randomUUID: () => 'export-id' }));
vi.mock('expo-file-system', () => ({
  Directory: class {},
  Paths: { cache: 'file:///cache' },
}));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
}));

describe('shareEventsAsIcs', () => {
  it('serializes, shares, and schedules cleanup of a temporary export', async () => {
    const temporaryFile = { uri: 'file:///export.ics', remove: vi.fn() };
    const dependencies = coordinatorDependencies({ temporaryFile });

    const result = await shareEventsAsIcs([eventDetails()], dependencies);

    expect(dependencies.writeTemporaryFile).toHaveBeenCalledWith(
      'life-events-log-2026-09-03.ics',
      expect.stringContaining('BEGIN:VEVENT\r\n')
    );
    expect(dependencies.share).toHaveBeenCalledWith(temporaryFile.uri);
    expect(dependencies.scheduleCleanup).toHaveBeenCalledWith(
      temporaryFile.remove,
      60_000
    );
    expect(temporaryFile.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      eventCount: 1,
      filename: 'life-events-log-2026-09-03.ics',
    });
  });

  it('removes the temporary export immediately when sharing fails', async () => {
    const temporaryFile = { uri: 'file:///export.ics', remove: vi.fn() };
    const dependencies = coordinatorDependencies({
      temporaryFile,
      share: vi.fn().mockRejectedValue(new Error('Share failed')),
    });

    await expect(
      shareEventsAsIcs([eventDetails()], dependencies)
    ).rejects.toThrow('Share failed');
    expect(temporaryFile.remove).toHaveBeenCalledOnce();
    expect(dependencies.scheduleCleanup).not.toHaveBeenCalled();
  });

  it('does not create a file when sharing is unavailable', async () => {
    const dependencies = coordinatorDependencies({
      isSharingAvailable: vi.fn().mockResolvedValue(false),
    });

    await expect(shareEventsAsIcs([], dependencies)).rejects.toThrow(
      'Sharing is not available on this device.'
    );
    expect(dependencies.writeTemporaryFile).not.toHaveBeenCalled();
  });
});

function coordinatorDependencies(
  overrides: Partial<IcsExportCoordinatorDependencies> & {
    temporaryFile?: { uri: string; remove: () => void };
  } = {}
): IcsExportCoordinatorDependencies {
  const temporaryFile = overrides.temporaryFile ?? {
    uri: 'file:///export.ics',
    remove: vi.fn(),
  };
  return {
    now: () => new Date('2026-09-03T14:05:06.000Z'),
    isSharingAvailable: vi.fn().mockResolvedValue(true),
    writeTemporaryFile: vi.fn().mockReturnValue(temporaryFile),
    share: vi.fn().mockResolvedValue(undefined),
    scheduleCleanup: vi.fn(),
    ...overrides,
  };
}

function eventDetails(): EventDetails {
  return {
    event: {
      id: 'event-1',
      title: 'Export me',
      date: '2026-09-03',
      time: null,
      significance: 'ordinary',
      categoryId: null,
      locationId: null,
      notes: '',
      createdAt: '2026-09-03T00:00:00.000Z',
      updatedAt: '2026-09-03T00:00:00.000Z',
      deletedAt: null,
    },
    category: null,
    location: null,
    tags: [],
    people: [],
    attachments: [],
  };
}
