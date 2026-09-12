import { hashOperationContent } from './utils/hashOperationContent';
import type {
  CausalContext,
  CreateOperationInput,
  Operation,
  OperationContent,
} from './types';
import type { SyncTransaction } from '../database';
import { syncFrontiers, syncLocalState } from '../schema';

/**
 * Builds a local operation without writing or reserving a sequence.
 * Apply it before creating the next operation, within the same transaction.
 * The caller supplies the entity ID, including for entity creation.
 */
export function createOperation(
  input: CreateOperationInput,
  tx: SyncTransaction
): Operation {
  const localState = tx.select().from(syncLocalState).get();
  if (!localState) {
    throw new Error('Local sync state has not been initialized.');
  }

  assertCounter(localState.observedLamport);
  const frontiers = tx.select().from(syncFrontiers).all();
  for (const frontier of frontiers) assertCounter(frontier.processedSequence);

  const causalContext: CausalContext = Object.fromEntries(
    frontiers.map(({ originDeviceId, processedSequence }) => [
      originDeviceId,
      processedSequence,
    ])
  );
  const localSequence = Object.hasOwn(causalContext, localState.deviceId)
    ? causalContext[localState.deviceId]!
    : 0;
  const originSequence = localSequence + 1;
  const lamport = localState.observedLamport + 1;
  assertCounter(originSequence);
  assertCounter(lamport);

  const content: OperationContent = {
    ...input,
    originDeviceId: localState.deviceId,
    originSequence,
    lamport,
    causalContext,
  };

  // Hashing validates JSON before cloning, so invalid values cannot be
  // silently dropped/coerced by JSON.stringify. No structuredClone dependency
  // is needed in the mobile runtime.
  const operationHash = hashOperationContent(content);
  // Clone the union member together to retain its discriminator correlation.
  const clonedContent = JSON.parse(JSON.stringify(content)) as OperationContent;
  return { ...clonedContent, operationHash };
}

function assertCounter(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Sync counter is outside the supported integer range.');
  }
}
