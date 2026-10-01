# Sync package import

Status: agreed design, implemented with native archive integration. Android
round-trip and cancellation verification remain to be performed on a device.
Existing merge policy and transaction guarantees are retained.

## Goal and example

Apply a manually selected sync package and repair missing live attachment blobs.
Accept the new flat layout: manifest.json, operations.jsonl, and hash-named blobs.
No backward compatibility is needed for unpublished packages.

Example: importing the same package twice does not duplicate operations. The
second import can still restore an image that is now missing locally, without
sealing pending local edits unnecessarily.

## Flow

1. Acquire attachment storage access and create a uniquely named temporary
   workspace. Keep access through repair and cleanup; it prevents orphan cleanup,
   not all concurrent app activity.
2. Use ArchiveService.list to inspect entry names and declared sizes. Require the
   two JSON files; allow only those names and 64-character lowercase hex blob
   names. Reject duplicates, unsafe paths, and unsupported package entries.
3. Extract only manifest.json to the workspace. Check its actual size before
   parsing, validate format/operation schema versions and manifest fields, and
   compare its inventory and declared lengths with the archive listing. A live
   blob absent from the manifest is allowed; a manifest-listed file absent from
   the archive is malformed packaging.
4. Check whether the local frontier covers the exporter frontier. If covered,
   skip operations extraction/application and local sealing; proceed to repair.
   Otherwise extract operations.jsonl to the workspace, checking its actual size.
5. In one synchronous SQLite transaction, recheck coverage before sealing. If
   still needed, seal local pending edits and read operations.jsonl in bounded
   chunks, delivering complete lines to applyOperation in file order. Do not
   sort incoming operations. Count lines/bytes and update SHA-256 over the exact
   bytes including newlines. Validate final count, length, digest, and frontier
   coverage before committing. Any failure rolls back sealing and incoming work.
6. After commit (or the covered-history skip), query all missing live hashes:
   active attachments with active parent events, including local attachments.
   For hashes offered by this package, extract in small batches to temporary storage, verify
   actual byte length and full-file SHA-256, then move verified files into
   attachment storage. Never extract unverified files directly into live storage.
7. Return operation and repair results, then clean up the import workspace.
   Preserve the selected source package and any successfully restored blobs.

### Failure and cancellation

- Preparation/extraction is cancellable. Await native settlement before deleting
  temporary output. Listing currently has no signal; check cancellation around it.
- Operation application remains non-cancellable and does not yield inside the
  synchronous transaction. Show the applying phase before entering it.
- After DB commit, cancellation means stop attachment repair, not undo import.
  Return the committed operation result plus partial repair counts and cancelled.
- Individual repair failures do not undo operations or other successful repairs.
  Retrying the package can repair missing content even when history is covered.
- Failed batch extraction discards that batch's temporary output, counts its
  blobs as failed, and continues to the next batch. No retries or partial salvage.
  Verification failures after successful extraction affect only that blob.
- Close file handles and attempt workspace cleanup on every exit. Cleanup errors
  must not mask the original failure or imply already committed data rolled back.

## Responsibilities

- Importer: orchestration, frontier decisions, atomic operation application,
  live-hash selection, progress, and result reporting.
- Package adapter: manifest/inventory validation, temporary files, JSONL reading,
  blob verification/promotion, and workspace cleanup.
- ArchiveService/native library: listing and selective extraction, archive
  mechanics, and native cancellation. Sync does not inspect ZIP binary headers
  or require a particular compression method for an entry.
- Existing operation functions: payload/integrity checks, merge resolution,
  domain mutations, and history bookkeeping, unchanged.
- UI: file picker, progress, cancellation/stopping state, and result presentation.

## Choices and tradeoffs

| Choice | Reason and cost |
| --- | --- |
| Temporary JSON files | Removes direct ZIP-to-DB parsing; adds disk writes and subsequent reads. |
| Manifest first, operations only if needed | Avoids extracting a large history for blob-only repair; adds an extraction call. |
| Bounded synchronous JSONL reader | Preserves atomic SQLite processing without retaining the whole history; can block JS during application. |
| Hash operations while applying | Avoids an extra hashing pass; final digest failure rolls the transaction back. |
| Extract only needed blobs | Avoids unnecessary image extraction; requires post-merge live-state lookup. |
| Verify full blobs before promotion | Never trust filenames or ZIP checksums alone; hashing adds work after native extraction. |

Covered-history imports do not verify the skipped operations file's content
digest, matching current behavior. They still validate package structure and
verify every blob they restore. Hashes provide integrity, not sender identity.

## Interface

Keep the existing public interface and result types:

```ts
importSyncPackage(
  packageUri: string,
  options?: SyncImportOptions,
): Promise<SyncImportResult>;
```

The factory retains database, clock, storage access, and filesystem dependencies.
Inject ArchiveService into the native package adapter rather than the merge code.

PreparedSyncPackage exposes prepareOperations(signal?) for extraction before
the transaction, synchronous forEachOperationLine, and prepareBlobBatch(hashes,
signal?) before individual repairBlob calls. The adapter owns temporary output;
repairBlob verifies and moves one file, and cleanup removes the workspace.

## First implementation slice

Replace the native package adapter with flat-layout listing, temporary JSON
extraction, and local JSONL reading. Preserve existing merge and result behavior.
Then replace blob repair extraction while retaining full-hash verification.

Verify export-to-import on Android, selective extraction, repeated-import repair,
missing blobs, invalid JSON/digests, transaction rollback, cancellation, and
temporary-file cleanup. Keep unit tests alongside real-device checks. Remove
the legacy ZIP implementation only after checking that nothing still uses it.
No performance framework, new merge policy, or source-package retention job.

## Agreed choices and remaining limitations

- Small batches: at most 16 files or a target of 64 MiB declared uncompressed
  bytes. A larger file forms its own batch. These are tuning defaults, not a
  measured optimum or a hard extraction-byte limit.
- Full verification of needed blobs only, reusing hashAttachmentFile's native
  SHA-256. Process files sequentially; memory usage is proportional to one blob.
  Cancellation is checked between blobs and after hashing, before promotion;
  an in-progress hash finishes before cancellation is observed. No partial hashes
  or trusted-package shortcut.
- Keep the shared 16 MiB manifest and operation-line limits. Do not carry forward
  ZIP32's archive/operations ceiling: the Android library supports ZIP64.
  No new whole-operations or individual-blob cap is introduced in this slice.
- Listed sizes are checked before extraction and actual sizes afterward. The
  native interface does not enforce a hard output-byte budget while extracting;
  these checks do not fully bound hostile archive disk expansion. Resource
  budgets/free-space policy remain a separate decision.
- Native cancellation is cooperative and may wait for the current entry.
  Await settlement before cleanup; cancellation stops repair, unlike a failed
  batch, which allows subsequent batches to proceed.
