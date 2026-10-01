import { and, eq } from 'drizzle-orm';
import { record, identifier, counter } from './helpers';
import type { SyncTransaction } from '../../database';
import { syncFrontiers, syncOperations } from '../../schema';
import {
  OPERATION_TYPES,
  SYNC_ENTITY_TYPES,
  type CausalContext,
  type Operation,
  type OperationType,
  type SyncEntityType,
} from '../types';
import type { OperationPayloadMap } from '../payloads';
import { hashOperationContent } from '../utils/hashOperationContent';
import { validatePayload } from './validatePayload';
import { OperationValidationError } from './OperationValidationError';
export { OperationValidationError } from './OperationValidationError';

/** Intermediate envelope before payload validation. */
export type EnvelopeValidatedOperation = Omit<Operation, 'payload'> & {
  payload: unknown;
};
export type OperationValidationResult = {
  status: 'ready' | 'already-applied';
  operation: Operation;
};

const allowedEntities = {
  'entity.create': ['event', 'category', 'tag', 'person', 'location'],
  'entity.patch': ['event', 'category', 'tag', 'person', 'location'],
  'entity.delete': ['event', 'category', 'tag', 'person', 'location'],
  'relation.add': ['event_tag', 'event_person'],
  'relation.remove': ['event_tag', 'event_person'],
  'attachment.create': ['attachment'],
  'attachment.delete': ['attachment'],
  'event.attachment.reorder': ['event'],
} satisfies { [K in OperationType]: (keyof OperationPayloadMap[K])[] };

const envelopeKeys = [
  'originDeviceId',
  'originSequence',
  'lamport',
  'causalContext',
  'operationType',
  'entityType',
  'entityId',
  'payload',
  'operationHash',
];

/** Read-only validation of one operation against the current transaction.
 * No UUID syntax checks, domain lookups, or signature checks.
 */
export function validateOperation(
  input: unknown,
  tx: SyncTransaction
): OperationValidationResult {
  const value = record(input, 'operation');
  const keys = Object.keys(value);
  if (
    keys.length !== envelopeKeys.length ||
    envelopeKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    fail('Operation has missing or unsupported fields.');
  }
  identifier(value.originDeviceId, 'originDeviceId');
  identifier(value.entityId, 'entityId');
  counter(value.originSequence, 'originSequence', 1);
  counter(value.lamport, 'lamport', 1);
  if (!OPERATION_TYPES.includes(value.operationType as OperationType))
    fail('Unsupported operationType.');
  if (!SYNC_ENTITY_TYPES.includes(value.entityType as SyncEntityType))
    fail('Unsupported entityType.');
  const operationType = value.operationType as OperationType;
  const entityType = value.entityType as SyncEntityType;
  if (
    !(allowedEntities[operationType] as readonly string[]).includes(entityType)
  )
    fail('Unsupported operation/entity combination.');
  const context = record(value.causalContext, 'causalContext');
  for (const [origin, sequence] of Object.entries(context)) {
    identifier(origin, 'causal context origin');
    counter(sequence, 'causal context sequence', 0);
  }
  const causalContext = context as CausalContext;
  if (
    sequenceAt(causalContext, value.originDeviceId) !==
    value.originSequence - 1
  )
    fail('Causal context must include the preceding origin sequence.');
  if (
    typeof value.operationHash !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/.test(value.operationHash)
  )
    fail('Invalid operationHash format.');

  const operation: EnvelopeValidatedOperation = {
    originDeviceId: value.originDeviceId,
    originSequence: value.originSequence,
    lamport: value.lamport,
    causalContext,
    operationType,
    entityType,
    entityId: value.entityId,
    payload: value.payload,
    operationHash: value.operationHash,
  };
  let computed: string;
  try {
    computed = hashOperationContent(operation);
  } catch {
    fail('Operation content is not valid canonicalizable JSON.');
  }
  if (computed !== operation.operationHash)
    fail('Operation hash does not match its content.');
  validatePayload(operation);

  const frontiers = Object.fromEntries(
    tx
      .select()
      .from(syncFrontiers)
      .all()
      .map((row) => [row.originDeviceId, row.processedSequence])
  );
  const processed = sequenceAt(frontiers, operation.originDeviceId);
  const stored = tx
    .select()
    .from(syncOperations)
    .where(
      and(
        eq(syncOperations.originDeviceId, operation.originDeviceId),
        eq(syncOperations.originSequence, operation.originSequence)
      )
    )
    .get();
  if (stored && stored.operationHash !== operation.operationHash)
    fail('Operation identity has conflicting content.');
  if (operation.originSequence <= processed) {
    if (!stored) fail('Processed operation is missing from local history.');
    return { status: 'already-applied', operation };
  }
  if (stored)
    fail('Stored operation is not covered by the processed frontier.');
  if (operation.originSequence !== processed + 1)
    fail('Missing preceding origin operations.');

  for (const [origin, sequence] of Object.entries(causalContext)) {
    if (sequenceAt(frontiers, origin) < sequence)
      fail(`Missing causal dependency ${origin}:${sequence}.`);
    if (sequence === 0) continue;
    const predecessor = tx
      .select()
      .from(syncOperations)
      .where(
        and(
          eq(syncOperations.originDeviceId, origin),
          eq(syncOperations.originSequence, sequence)
        )
      )
      .get();
    if (!predecessor)
      fail(
        `Causal dependency ${origin}:${sequence} is missing from local history.`
      );
    if (operation.lamport <= predecessor.lamport)
      fail('Lamport timestamp must exceed causal predecessors.');
    // Contexts summarize transitive history, not just the named endpoint dots.
    for (const [ancestor, required] of Object.entries(
      predecessor.causalContext
    )) {
      if (sequenceAt(causalContext, ancestor) < required)
        fail('Causal context omits a predecessor dependency.');
    }
  }
  return { status: 'ready', operation };
}

function fail(message: string): never {
  throw new OperationValidationError(message);
}
function sequenceAt(context: CausalContext, origin: string): number {
  return Object.hasOwn(context, origin) ? context[origin]! : 0;
}
