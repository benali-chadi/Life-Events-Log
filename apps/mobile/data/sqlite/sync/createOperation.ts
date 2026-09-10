import { hashOperationContent } from './utils/hashOperationContent';
import type {
  CausalContext,
  CreateOperationInput,
  JsonObject,
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
export function createOperation<TPayload extends JsonObject>(
  input: CreateOperationInput<TPayload>,
  tx: SyncTransaction
): Operation<TPayload> {
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

  const content: OperationContent<TPayload> = {
    originDeviceId: localState.deviceId,
    originSequence,
    lamport,
    causalContext,
    operationType: input.operationType,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload,
  };

  // Hashing validates JSON before cloning, so invalid values cannot be
  // silently dropped/coerced by JSON.stringify. No structuredClone dependency
  // is needed in the mobile runtime.
  const operationHash = hashOperationContent(content);
  const payload = JSON.parse(JSON.stringify(content.payload)) as TPayload;

  return { ...content, payload, operationHash };
}

function assertCounter(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Sync counter is outside the supported integer range.');
  }
}
