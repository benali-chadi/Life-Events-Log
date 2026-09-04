import { randomUUID } from 'expo-crypto';
import { Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type {
  EventExportItem,
  EventExportQuery,
  EventExportRepository,
} from '@/data/repositories';
import type { UUID } from '@/models';
import { serializeEventsToIcs } from './serializeEventsToIcs';

const EXPORT_CLEANUP_DELAY_MS = 60_000;

type TemporaryExport = {
  uri: string;
  remove: () => void;
};

export type IcsExportCoordinatorDependencies = {
  now: () => Date;
  isSharingAvailable: () => Promise<boolean>;
  writeTemporaryFile: (filename: string, contents: string) => TemporaryExport;
  share: (uri: string) => Promise<void>;
  scheduleCleanup: (cleanup: () => void, delayMs: number) => void;
};

export type IcsExportResult = {
  eventCount: number;
  filename: string;
};

export type IcsExportSource =
  | { kind: 'selected'; ids: readonly UUID[] }
  | { kind: 'query'; query: EventExportQuery };

export async function exportEventsAsIcs(
  source: IcsExportSource,
  repository: EventExportRepository,
  dependencies: IcsExportCoordinatorDependencies = nativeDependencies
): Promise<IcsExportResult> {
  const events =
    source.kind === 'selected'
      ? await repository.getByIds(source.ids)
      : await repository.list(source.query);
  if (events.length === 0) {
    throw new Error('There are no events to export.');
  }
  return shareEventsAsIcs(events, dependencies);
}

export async function shareEventsAsIcs(
  events: readonly EventExportItem[],
  dependencies: IcsExportCoordinatorDependencies = nativeDependencies
): Promise<IcsExportResult> {
  if (!(await dependencies.isSharingAvailable())) {
    throw new Error('Sharing is not available on this device.');
  }

  const exportedAt = dependencies.now();
  const filename = exportFilename(exportedAt);
  const contents = serializeEventsToIcs(events, exportedAt);
  const temporaryExport = dependencies.writeTemporaryFile(filename, contents);

  try {
    await dependencies.share(temporaryExport.uri);
  } catch (error) {
    temporaryExport.remove();
    throw error;
  }

  // Android receivers may read the shared content URI shortly after the chooser
  // closes, so the cache file cannot be removed immediately after shareAsync.
  dependencies.scheduleCleanup(temporaryExport.remove, EXPORT_CLEANUP_DELAY_MS);

  return { eventCount: events.length, filename };
}

function exportFilename(exportedAt: Date) {
  if (!Number.isFinite(exportedAt.getTime())) {
    throw new RangeError('The ICS export timestamp must be a valid date.');
  }
  return `life-events-log-${exportedAt.toISOString().slice(0, 10)}.ics`;
}

const nativeDependencies: IcsExportCoordinatorDependencies = {
  now: () => new Date(),
  isSharingAvailable: Sharing.isAvailableAsync,
  writeTemporaryFile: (filename, contents) => {
    const directory = new Directory(Paths.cache, 'ics-exports', randomUUID());
    directory.create({ intermediates: true });

    try {
      const file = directory.createFile(filename, 'text/calendar');
      file.write(contents);
      return {
        uri: file.uri,
        remove: () => {
          if (directory.exists) directory.delete();
        },
      };
    } catch (error) {
      if (directory.exists) directory.delete();
      throw error;
    }
  },
  share: (uri) =>
    Sharing.shareAsync(uri, {
      dialogTitle: 'Export events',
      mimeType: 'text/calendar',
      UTI: 'public.calendar-event',
    }),
  scheduleCleanup: (cleanup, delayMs) => {
    setTimeout(cleanup, delayMs);
  },
};
