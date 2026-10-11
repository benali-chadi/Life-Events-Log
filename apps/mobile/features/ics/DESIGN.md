# iCalendar (.ics) import and export

Status: import preview, transactional commit, recurrence expansion, and export
sharing are implemented. This note describes the current behavior; open questions
below are follow-ups, not agreed implementation changes.

## Goal and example

Exchange life events with calendar applications using `.ics` files. Import lets
the user review events before creating them; export supports selected events or
an event query, including all events when no filters are applied.

Example: export a notable event in the teal “Personal” category, with notes,
tags, people, and a location. Importing that file into LEL restores those values
by name, with a preview before saving. Photos and attachments are not included.

ICS is an interchange format, not a backup or sync package. Every import creates
new event IDs, even when the same file or exported UID has been imported before.
Use `.lel-package` for history-preserving synchronization.

## Flow

### Import

1. Read the selected file as text after existing metadata has loaded. Parse its
   `VCALENDAR` and `VEVENT` components, retaining timezone definitions and raw
   event components for recurrence expansion.
2. Expand recurring series into individual occurrences using `RRULE`, `RDATE`,
   `EXDATE`, and occurrence overrides. Inherit omitted metadata from the master,
   including the LEL custom fields. Preserve orphaned overrides as standalone
   input rather than silently dropping them.
3. Map occurrences into preview candidates. Skip cancelled events and events
   with missing or invalid start dates. Show warnings for missing/truncated
   titles, unusable attendee names, and invalid custom values. Match metadata by
   normalized comparable name, proposing new metadata where needed.
4. Let the user select events, inspect warnings, and optionally choose or propose
   one category that replaces the imported category on every selected event.
5. Build commit input containing only selected events and their referenced new
   metadata. The repository rechecks metadata and creates events, relationships,
   and pending sync operations in one SQLite transaction.

Preparation errors show a message and leave the import screen. Leaving before
commit saves nothing; the preparation effect ignores results after unmount but
does not interrupt synchronous parsing or expansion. Commit disables selection
and cancellation while pending. A commit failure rolls back database writes and
keeps the preview and selection available for retry.

Expansion rejects more than 5,000 occurrences per series or 10,000 events per
import rather than silently truncating. An unbounded rule requires an explicit
end date. The current screen calls expansion without a range, so such calendars
fail preparation; it does not yet offer a range picker.

### Export

1. Load export details by selected IDs or query. Reject an empty result and check
   that native sharing is available.
2. Serialize one `VCALENDAR` with standalone `VEVENT` components and write
   `life-events-log-YYYY-MM-DD.ics` in an isolated cache directory.
3. Open the native share sheet using `text/calendar`. On a sharing error, remove
   the temporary directory and reject. After the share call resolves, schedule
   cleanup after 60 seconds so receivers have time to read the file.

The coordinator has no AbortSignal or transfer-completion acknowledgment. A
resolved share call is not proof that a receiver saved the file. Writing errors
clean up the native adapter's directory; app termination can prevent scheduled
cleanup from running.

## Responsibilities

- `ical.js`: calendar parsing and recurrence iteration/occurrence resolution.
- Parsing and expansion: plain typed values, source context, override inheritance,
  range validation, and output limits; mutable library objects stay internal.
- Mapping: LEL field conversion, metadata proposals, skip reasons, and warnings.
  It performs no database writes.
- Preview and commit builder: selection, category override, and filtering unused
  metadata proposals out of commit input.
- Event import repository: validation, metadata reuse, fresh IDs, transactional
  persistence, and normal pending sync mutations.
- Serializer: app-owned export field mapping, text/parameter escaping, CRLF
  output, and content-line folding at 75 UTF-8 bytes.
- Expo filesystem/sharing adapters: cache files and native sharing. The export
  coordinator owns sequencing and the cleanup policy.

## Choices and tradeoffs

| Choice | Reason and cost |
| --- | --- |
| Library parsing and recurrence, app-owned serialization | Avoids writing a recurrence engine; keeps export small and limited to LEL's fields. |
| Separate parse, expand, map, preview, and commit | Keeps transformations testable and database writes out of preparation; retains intermediate representations in memory. |
| Whole-file processing | Simple implementation; file text, parsed components, expanded events, and preview data can coexist in memory. Output limits do not bound input bytes or parsing time. |
| Flatten recurrence into independent events | Fits the LEL event model; recurrence rules and series identity are not persisted or re-exported. |
| Preserve displayed date and time | Import takes calendar date/time components without converting to the device timezone; timezone context is not stored on the created event. Export uses floating times, or date-only values when time is absent. |
| Reuse metadata by name, always create events | Prevents unnecessary metadata duplication; repeated imports deliberately duplicate events rather than merge by UID. |
| One commit transaction | Prevents partial imports; large imports hold a synchronous transaction and cannot be cancelled during commit. |
| Cache file and delayed cleanup | Avoids deleting a file immediately after the share sheet closes; uses temporary disk space and a best-effort timer. Export also builds the complete string in memory. |

## Field mapping and custom fields

| Calendar field | LEL behavior |
| --- | --- |
| `SUMMARY` | Event title; missing/blank imports become “Untitled event”, titles over 100 characters are shortened with a warning. |
| `DTSTART` | Event date and optional time. Date-only values have no time; seconds are not retained. |
| `DESCRIPTION` | Notes. |
| `LOCATION` | Location name. |
| `CATEGORIES` | Tag names, not the single LEL category. |
| `ATTENDEE` | People by `CN`, falling back to a `mailto:` address on import. Export uses `CN` and `urn:lel:person:<encoded-person-id>`; person IDs are not restored on import. |
| `UID` | Export uses `<event-id>@lifeeventslog.local`; import uses UID as source/recurrence context, not as a database identity or deduplication key. |
| `DTEND`, timezone, recurrence, attendee participation fields | Parsed context where applicable, but not persisted as LEL event fields. |

The two LEL extension properties preserve values that have no equivalent in our
standard field mapping:

```ics
X-LEL-CATEGORY;COLOR=teal:Personal
X-LEL-SIGNIFICANCE:notable
```

- `X-LEL-CATEGORY`: escaped category name, emitted only when a category exists.
  `COLOR` is a LEL color token, not a hex color. Supported tokens are `blue`,
  `green`, `rose`, `amber`, `violet`, `teal`, `cyan`, `coral`, `olive`, `brown`,
  `slate`, `navy`, and `magenta`. Import reuses an existing category by name,
  retaining its existing color. For a new category, a missing/invalid color
  becomes `blue` with a warning. A missing/blank category produces no category.
- `X-LEL-SIGNIFICANCE`: always emitted on export. Supported values are `ordinary`,
  `notable`, `major`, and `turning-point`. Missing values import as `ordinary`;
  invalid values also become `ordinary`, with a warning.

Color and significance tokens are matched case-insensitively. Recurring
occurrences inherit these properties unless an override explicitly supplies
them. The preview's optional category override takes precedence during commit.
Preservation by another calendar application is outside our control; these
extensions do not make ICS a lossless LEL backup.

## Interface

Existing public entry points in `index.ts`:

```ts
parseIcs(icsText: string): ParsedIcsCalendar;
expandIcsRecurrences(
  parsed: ParsedIcsCalendar,
  range?: IcsRecurrenceRange
): ExpandedIcsEvent[];
mapIcsImport(
  events: readonly ExpandedIcsEvent[],
  metadata: IcsImportMetadataSnapshot
): IcsImportMappingResult;
buildIcsImportCommitInput(
  mapping: IcsImportMappingResult,
  selectedCandidateIds: ReadonlySet<string>,
  category: EventImportCategory | null
): CommitEventImportInput;
serializeEventsToIcs(
  events: readonly EventExportItem[],
  exportedAt: Date
): string;
exportEventsAsIcs(
  source: IcsExportSource,
  repository: EventExportRepository,
  dependencies?: IcsExportCoordinatorDependencies
): Promise<IcsExportResult>;
```

The import repository exposes `commit(input): Promise<CommitEventImportResult>`.
Export dependencies inject the clock, sharing availability, file writer, share
call, and cleanup scheduler. The optional recurrence range has an inclusive
`to` date and optional inclusive `from` date; it limits recurring expansion,
not standalone events.

## First implementation slice

The useful slice is already implemented: file preparation, selectable preview,
one atomic import commit, and standalone export/share. This documentation adds
no implementation scope.

Existing focused tests cover parsing, recurrence rules/exclusions/overrides and
limits, custom-field inheritance and mapping, metadata reuse, selected commit
input, repository persistence, serialization round trips/escaping/folding, and
share failure/cleanup coordination. Native file picking and receiver behavior
still need device-level verification; mocked sharing tests cannot establish
transfer completion or the adequacy of the cleanup delay.