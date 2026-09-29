# Orphan attachment blob cleanup

Status: implemented. This note describes current behavior and wiring, not a new
background scheduler or a change to deletion policy.

## Goal and example

Reclaim managed attachment files that no active attachment on an active event
needs. A blob is live if **at least one** attachment with its content hash has
`deletedAt === null` and its parent event also has `deletedAt === null`.

Example: two attachments share one blob. Deleting one does not remove the blob
while the other remains live. Deleting both parent events makes it orphaned,
even if their attachment rows are not individually tombstoned. A file with no
attachment rows at all is also orphaned (for example, after a failed creation).

Cleanup deletes files only. It does not remove attachment rows, tombstones,
pending operations, or sealed history. It does not wait for another device to
acknowledge deletion. Restoring a database row cannot guarantee its file still
exists; later sync import can repair missing live content if a package offers it.

## Flow

1. A caller requests cleanup through the shared storage-access instance.
2. Wait until no protected storage users are active; allow only one sweep at a time.
3. Query distinct live content hashes once, then list managed blob filenames.
4. For each hash-named file absent from the live set, attempt deletion. Do not
   requery the database per file, read file contents, or calculate hashes.
5. Check cancellation before processing/deleting files. Yield to the app after
   every 50 listed files by default, when more files remain.
6. Return `{ scanned, deleted, failed, cancelled }`. A later run starts from
   scratch with fresh database and filesystem snapshots, not a saved cursor.

If the initial database query or directory listing fails, reject without deleting
anything. An individual deletion failure increments `failed` and processing
continues. A file already absent is neither a successful deletion nor a failure.
Deletion is not transactional: cancellation does not restore removed files.

## Responsibilities and coordination

- [Cleanup function](./cleanupOrphanAttachmentBlobs.ts): live-set sweep, yielding,
  cancellation checks, and result counts. Requires caller coordination throughout.
- [SQLite references](../../sqlite/attachmentBlobReferences.ts): distinct hashes
  from active attachments joined to active parent events.
- [Storage adapter](../../attachments/blobCleanupStorage.ts): immediate files in
  `Paths.document/attachments` with 64-character lowercase hexadecimal names.
  Ignore subdirectories and other names; never recursively sweep attachment storage.
- [Coordinator](./coordinator.ts): one running promise and AbortController;
  overlapping starts share the run, cancellation waits for it to settle.
- [Storage access](../../attachments/storageAccess.ts): exclude cleanup while
  protected work runs. New access cancels and awaits a running sweep before
  starting that work. A cancelled sweep is requested again after users finish.
- Expo FileSystem performs listing/deletion; no compression or hashing library
  participates in this job.

Storage access is shared per database/storage pair in one JavaScript runtime.
It is **not an OS lock**, and normal protected users may run concurrently with
each other. Every path that creates blobs or new live references must participate,
covering file creation through database commit. Reads needing a file to remain
available must also participate. Cancellation alone cannot protect an import.

Repeated requests coalesce into a pending request; a request during a sweep can
cause one additional sweep. A rejected sweep is logged, not automatically retried
in a loop. Individual deletion failures remain in the result; current app wiring
does not surface those counts to the user or automatically retry failed files.

## Where and when it runs today

| Trigger | Current call site | Timing |
| --- | --- | --- |
| App startup | [AppLayout](../../../app/_layout.tsx) | Effect after SQLite initialization/migrations, also if the storage-access instance changes. |
| Single attachment deletion | [useDeleteAttachmentMutation](../../query/useAttachmentMutations.ts) | After `repository.softDelete` succeeds. |
| Bulk attachment deletion | [useDeleteManyAttachmentsMutation](../../query/useAttachmentMutations.ts) | After `repository.softDeleteMany` succeeds; one request per call. |
| Single event deletion | [useDeleteEventMutation](../../query/useEventMutations.ts) | After `repository.softDelete` succeeds. |
| Bulk event deletion | [useDeleteManyEventsMutation](../../query/useEventMutations.ts) | After `repository.softDeleteMany` succeeds; one request per call. |

These calls request cleanup without awaiting the sweep. Deletion completion does
not mean all orphan files have already been removed. Triggers live in mutation
hooks, not repository methods: calling a repository directly does not request cleanup.

There is currently **no foreground listener, timer, OS background job, or explicit
before/after-sync cleanup trigger**. Incoming sync deletions therefore do not
request a sweep themselves; those orphans wait for another trigger such as startup.
Releasing storage access only starts cleanup if a request is already pending.

### Existing protected operations (not cleanup triggers)

- [Attachment mutations](../../query/useAttachmentMutations.ts): create, import
  (file copy/hash through row creation), and restore.
- [Attachment viewer sharing](../../../components/event-attachments/AttachmentViewer.tsx):
  the `shareAttachment` call.
- [Sync export](../../sqlite/sync/export/createSyncExporter.ts): snapshot/file
  preparation through native packaging completion, while original blobs are read.
- [Sync import](../../sqlite/sync/import/createSyncImporter.ts): package preparation,
  operation application, blob repair, and temporary workspace cleanup.

## Choices and tradeoffs

- One live-set query plus a full directory listing avoids per-blob SQL queries.
  Memory grows with live hashes and stored filenames; each run scans the folder.
- Small yielding batches keep long sweeps cooperative, but listing and individual
  filesystem calls remain synchronous. The batch size is not a measured optimum.
- No deleted-hash ledger is needed: successfully removed files disappear from the
  next directory listing. Shared hashes naturally remain until their last live use.
- No grace period or restoration guarantee. Package caches, import/export staging,
  legacy filenames, and sealed-operation garbage collection are outside this job.

## Interface

```ts
cleanupOrphanAttachmentBlobs(options: CleanupOptions): Promise<CleanupResult>;

// Normal app callers use the shared instance provided by AppLayout:
storageAccess.requestCleanup(): void;
storageAccess.withAccess<T>(work: () => T | Promise<T>): Promise<T>;
```

The provider is [AttachmentStorageAccessProvider](../../attachments/AttachmentStorageAccessProvider.tsx).
Do not construct a separate coordinator for each screen or bypass storage access
by directly starting the cleanup function from app code.

## First implementation slice and verification

The initial slice is complete: sweep, SQLite/filesystem adapters, cancellation
coordinator, shared access, and the startup/deletion wiring above. Existing tests
cover live/shared hashes, deleted parents, unmanaged names, read/deletion failures,
cancellation, fresh restarts, and access acquired during a sweep.

Future decisions remain separate: additional triggers, measured batch tuning,
user-visible failure reporting, retention/grace periods, and coordination across
multiple runtimes/processes. No such behavior is implied by this note.
