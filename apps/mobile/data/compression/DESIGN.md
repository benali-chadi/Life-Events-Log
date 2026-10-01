# Archive service: Android native ZIP adapter

## Goal and example

Decouple sync from ZIP mechanics using a TypeScript interface and an Android
class backed by react-native-zip-archive. For example, create an archive from
manifest.json and operations.jsonl at level 6, then append selected attachment
files at level 0, without temporary blob copies.

## Flow

Validate inputs, call the native library, and await completion. Creation requires
a nonexistent destination; append requires an existing archive. Reject duplicate
entry names, including collisions with existing entries during append. Listing
inspects the directory without extracting contents. Extraction rejects unsafe
paths and missing requested entries.

The caller owns temporary outputs and removes them on failure or cancellation.
Append is not transactional. Never publish a package until every step succeeds.
Cleanup must wait until native writing has stopped.

## Responsibilities

- ArchiveService exposes create, append, list, and extract.
- The adapter translates arguments, checks supported paths, and handles native
  error/cancellation behavior.
- The library owns ZIP encoding, decoding, and native filesystem processing.
- Sync retains manifest rules, hashes, operation validation, and database work.

## Choices

Android only initially; no iOS adapter or custom native code in this slice.
Use the published react-native-zip-archive 9.5.2, pinned exactly.
Native processing replaces JavaScript codec loops. Level 0 remains DEFLATE, not
STORE. The adapter supports source basenames, not arbitrary entryPath mappings;
reject an explicit differing entryPath rather than silently ignoring it.

Sync export and import now use this adapter with a flat package layout and
temporary JSON files. No backward compatibility is required for unpublished
packages. The obsolete JavaScript ZIP reader/writer has been removed.

## Interface

See ArchiveService.ts for the agreed types and signatures. create, append, and
extract accept optional AbortSignal parameters. No public progress callback yet.

## First implementation slice

Add the interface, native adapter, and focused unit tests. Verify native Android
append, compression levels, selective extraction, and cancellation on a device
before integration. Mocked unit tests cannot establish those native behaviors.

## Agreed cancellation settlement

Inspection of the installed 9.5.2 index.js shows withAbort uses Promise.race:
it requests native cancel and rejects immediately, without waiting for the
underlying operation. Passing the signal directly therefore does not uphold our
safe-cleanup contract.

Invoke zip/unzip without the library's signal wrapper, listen
for abort ourselves, request cancel(), and await the original operation before
rejecting with AbortError. The library has global cancellation, so adapter calls
must not overlap across instances. Reject overlapping calls rather than queueing
them. All library consumers must use this adapter for that guarantee to hold.
Cancellation failure still waits for original work to settle. No partial files
are removed by the adapter itself.

Extraction selects exact files, not recursive directory selections. Empty
extraction is a no-op; empty creation/append is rejected. Native Android behavior
still requires device verification for the import integration.
