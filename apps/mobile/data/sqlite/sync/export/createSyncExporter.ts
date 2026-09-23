import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { AppDatabase } from '../../database';
import {
  eventAttachments,
  events,
  syncFrontiers,
  syncLocalState,
  syncOperations,
} from '../../schema';
import type { AttachmentStorageAccess } from '../../../attachments/storageAccess';
import { sealPendingOperations } from '../pending/sealPendingOperations';
import type {
  ExportWorkspace,
  SyncExportOptions,
  SyncExportResult,
  SyncPackageManifest,
} from './types';

function checkCancellation(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Sync export cancelled.');
  error.name = 'AbortError';
  throw error;
}

export type SyncExportDependencies = {
  database: AppDatabase;
  storageAccess: AttachmentStorageAccess;
  createId(): string;
  now(): string;
  createWorkspace(packageId: string): ExportWorkspace;
  compressPackage(input: {
    sourceDirectory: string;
    destination: string;
  }): Promise<void>;
  chunkSize?: number;
  yieldToApp?: () => Promise<void>;
};

/** Full-history export. Permanent history must remain immutable/unpruned while
 * paging. No sharing, orphan cleanup, or recipient acknowledgment happens here.
 */
export function createSyncExporter({
  database,
  storageAccess,
  createId,
  now,
  createWorkspace,
  compressPackage,
  chunkSize = 1_000,
  yieldToApp = () => new Promise((resolve) => setTimeout(resolve, 0)),
}: SyncExportDependencies) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1)
    throw new Error('Export chunk size must be a positive safe integer.');
  return async function syncExport({
    signal,
    onProgress,
  }: SyncExportOptions = {}): Promise<SyncExportResult> {
    checkCancellation(signal);
    const packageId = createId();
    let workspace: ExportWorkspace | undefined;
    let completed = false;
    try {
      const manifest = await storageAccess.withAccess(
        async (): Promise<SyncPackageManifest> => {
          checkCancellation(signal);
          onProgress?.({ phase: 'preparing', cancellable: true });
          await yieldToApp();
          checkCancellation(signal);
          workspace = createWorkspace(packageId);
          const snapshot = database.transaction((tx) => {
            sealPendingOperations(tx, { now });
            const local = tx.select().from(syncLocalState).get();
            if (!local) throw new Error('Sync local state is not initialized.');
            return {
              deviceId: local.deviceId,
              frontier: Object.fromEntries(
                tx
                  .select()
                  .from(syncFrontiers)
                  .all()
                  .map((row) => [row.originDeviceId, row.processedSequence])
              ),
              hashes: tx
                .selectDistinct({ hash: eventAttachments.contentHash })
                .from(eventAttachments)
                .innerJoin(events, eq(events.id, eventAttachments.eventId))
                .where(
                  and(
                    isNull(eventAttachments.deletedAt),
                    isNull(events.deletedAt)
                  )
                )
                .orderBy(asc(eventAttachments.contentHash))
                .all()
                .map((row) => row.hash),
              createdAt: now(),
            };
          });
          const operations: SyncPackageManifest['operations'] = {
            path: 'operations.jsonl',
            count: 0,
            byteLength: 0,
            sha256: '',
          };
          const digest = sha256.create();
          const writer = workspace.openOperations();
          try {
            let cursor:
              | {
                  lamport: number;
                  originDeviceId: string;
                  originSequence: number;
                }
              | undefined;
            // A single JSON parameter avoids SQLite's variable limit for many origins.
            const frontier = JSON.stringify(snapshot.frontier);
            while (true) {
              checkCancellation(signal);
              const rows = database
                .select()
                .from(syncOperations)
                .where(
                  and(
                    sql`EXISTS (SELECT 1 FROM json_each(${frontier}) AS export_frontier WHERE export_frontier.key = ${syncOperations.originDeviceId} AND ${syncOperations.originSequence} <= export_frontier.value)`,
                    cursor
                      ? or(
                          gt(syncOperations.lamport, cursor.lamport),
                          and(
                            eq(syncOperations.lamport, cursor.lamport),
                            gt(
                              syncOperations.originDeviceId,
                              cursor.originDeviceId
                            )
                          ),
                          and(
                            eq(syncOperations.lamport, cursor.lamport),
                            eq(
                              syncOperations.originDeviceId,
                              cursor.originDeviceId
                            ),
                            gt(
                              syncOperations.originSequence,
                              cursor.originSequence
                            )
                          )
                        )
                      : undefined
                  )
                )
                .orderBy(
                  asc(syncOperations.lamport),
                  asc(syncOperations.originDeviceId),
                  asc(syncOperations.originSequence)
                )
                .limit(chunkSize)
                .all();
              if (!rows.length) break;
              for (const {
                receivedAt: _receivedAt,
                appliedAt: _appliedAt,
                ...operation
              } of rows) {
                const bytes = utf8ToBytes(`${JSON.stringify(operation)}\n`);
                writer.write(bytes);
                digest.update(bytes);
                operations.count++;
                operations.byteLength += bytes.byteLength;
              }
              cursor = rows[rows.length - 1]!;
              onProgress?.({
                phase: 'operations',
                completed: operations.count,
                cancellable: true,
              });
              await yieldToApp();
            }
          } finally {
            writer.close();
          }
          operations.sha256 = bytesToHex(digest.digest());
          const blobs: SyncPackageManifest['blobs'] = [];
          onProgress?.({
            phase: 'blobs',
            completed: 0,
            total: snapshot.hashes.length,
            cancellable: true,
          });
          for (let i = 0; i < snapshot.hashes.length; i++) {
            checkCancellation(signal);
            const contentHash = snapshot.hashes[i]!;
            const byteLength = workspace.copyBlob(contentHash);
            if (byteLength !== null) blobs.push({ contentHash, byteLength });
            onProgress?.({
              phase: 'blobs',
              completed: i + 1,
              total: snapshot.hashes.length,
              cancellable: true,
            });
            await yieldToApp();
          }
          return {
            formatVersion: 1,
            operationSchemaVersion: 1,
            packageId,
            createdByDeviceId: snapshot.deviceId,
            createdAt: snapshot.createdAt,
            exporterFrontier: snapshot.frontier,
            intendedRecipientDeviceId: null,
            baseFrontier: null,
            operations,
            blobs,
          };
        }
      );
      checkCancellation(signal);
      workspace!.writeManifest(manifest);
      await yieldToApp();
      checkCancellation(signal);
      // From this boundary onward, cancellation is intentionally not observed.
      onProgress?.({ phase: 'compressing', cancellable: false });
      await compressPackage({
        sourceDirectory: workspace!.contentsUri,
        destination: workspace!.partialPackageUri,
      });
      const uri = workspace!.finalize();
      completed = true;
      return {
        uri,
        packageId,
        operationCount: manifest.operations.count,
        blobCount: manifest.blobs.length,
      };
    } finally {
      try {
        await workspace?.cleanup(completed);
      } catch (error) {
        console.error('Sync export temporary-file cleanup failed', error);
      }
    }
  };
}
