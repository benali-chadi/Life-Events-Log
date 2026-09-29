# Sync package export

Status: export integration implemented; Android device verification remains.
Import integration and completed-package retention are separate follow-ups.

## Goal and example

Create one portable `.lel-package` containing the full sealed operation history
at a captured frontier and the available blobs needed by that snapshot's live
attachments. Timeline filters and selection do not affect export.

Example: two active attachments sharing a hash contribute one blob. A deleted
event does not keep its images live. A missing live blob is omitted without
failing export; its attachment operation remains in history.

## Flow

1. Acquire attachment storage access and create an isolated temporary workspace.
2. In one SQLite transaction, seal pending operations and capture the device ID,
   frontier, export time, and distinct hashes referenced by active attachments
   whose parent events are also active.
3. Read immutable operations bounded by that frontier in pages (currently 1,000
   rows), ordered by `(lamport, originDeviceId, originSequence)`. Write UTF-8
   JSONL, excluding local received/applied timestamps. Count lines and bytes and
   incrementally hash the exact written bytes, including newlines.
4. Resolve available blob paths and sizes from the captured hashes. Do not copy
   blobs into staging or rehash them. Write the manifest describing the operation
   file and the blobs actually selected for packaging.
5. `ArchiveService.create` packages the two temporary JSON files at level 6.
   `append` adds original blob files at level 0; skip append when there are none.
6. After both calls succeed, finalize the partial archive and return its URI.
   Remove temporary JSON files, but retain the completed package for sharing.

Hold storage access through native packaging completion: direct source reads
must remain protected from orphan cleanup. This access excludes cleanup, not
other normal app operations. Snapshot consistency relies on immutable, unpruned
history and content-addressed blobs, not on the loading modal being a DB lock.

On failure or cancellation, await native settlement before removing the partial
package and workspace. Cleanup failure is reported without hiding the original
error. Operations already sealed remain sealed, even if packaging fails.

## Responsibilities

- Exporter: snapshot, operation selection/order, manifest, progress, cancellation,
  and orchestration. Errors reject its promise; no separate onError callback.
- Workspace/filesystem adapter: temporary JSON writers, blob path/size lookup,
  finalization, and cleanup. Replace blob-copy behavior with direct source lookup.
- ArchiveService: archive calls and their validation/cancellation contracts;
  see [archive design](../../../compression/DESIGN.md).
- Native ZIP library: archive encoding and file processing. No custom ZIP parser
  or JS compression loops in this export path.
- UI: prevent duplicate transfers, display phases, share only completed packages.
  Sharing is separate from creating the package.

## Choices and tradeoffs

| Choice | Reason and cost |
| --- | --- |
| Full history, bounded by snapshot frontier | Simple recipient-independent export; packages grow with history. |
| Paged JSONL writing | Avoids retaining the whole history in memory; still uses a temporary file. |
| Direct blob sources | Removes staging copies and their disk cost; extends cleanup protection through packaging. |
| Flat archive: JSON files plus hash-named blobs | Fits the Android adapter's basename behavior without custom native code. |
| JSON level 6; blobs level 0 | Compress text, avoid expensive image recompression. Level 0 is DEFLATE, not STORE. |
| Native Android adapter | Less app-owned archive code; requires a native build and Android verification. |

Do not run orphan cleanup as part of export. Select live hashes explicitly.
Do not add missing-blob lists, signatures, incremental export, or recipient
acknowledgments in this slice. No backward compatibility for unpublished packages.
Keep existing manifest fields and `.lel-package` extension; only blob entry paths
change from `blobs/<hash>` to `<hash>`.

## Interface

Retain the public factory/call pattern and existing result/options types:

```ts
createSyncExporter(dependencies: SyncExportDependencies):
  (options?: SyncExportOptions) => Promise<SyncExportResult>;
```

Inject `archive: ArchiveService` in place of `compressPackage`. Keep database,
storage access, clock, ID generation, and workspace creation as dependencies.
The workspace exposes operationsUri and manifestUri, and findBlob(hash) returns
the original sourceUri and byteLength (or null if missing). It retains JSON
writing, finalization, and cleanup; it no longer copies blobs.

## First implementation slice

This slice replaces only export packaging and workspace blob copying.
Keep the old importer/ZIP reader until the import integration slice;
the old importer will not accept the new flat packages in the interim.

Test snapshot bounds, JSONL digest/count/length, missing/shared blobs, zero blobs,
two-pass archive calls, failures/cancellation, and cleanup protection lifetime.
On Android, verify both batches survive append and their contents are correct.
Mocked unit tests do not establish native ZIP behavior or performance.

## Agreed failure and progress behavior

- Packaging cancellation: pass
  the signal through create/append and keep Cancel available, showing a stopping
  state until native work settles.
- Progress: retain phase-level packaging feedback initially; no byte percentages
  without real native progress. The blobs phase now selects sources, not copies.
- Unexpected loss of a selected blob during packaging: fail/discard the partial
  package, not publish a manifest that overclaims files. This differs from a blob
  already missing during source selection, which is simply omitted.

## Open questions

- Completed-package retention/cleanup needs a separate bounded policy; packages
  must not be kept indefinitely. Do not delete
  the package just because the share sheet closes.
