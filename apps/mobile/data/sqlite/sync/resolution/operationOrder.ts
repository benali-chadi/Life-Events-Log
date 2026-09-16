import type { Operation, OperationId } from '../types';

export function hasSeen(
  operation: Pick<Operation, 'causalContext'>,
  other: OperationId
): boolean {
  return (
    Object.hasOwn(operation.causalContext, other.originDeviceId) &&
    operation.causalContext[other.originDeviceId]! >= other.originSequence
  );
}

/** Fixed, locale-independent ordering. Wall-clock time never picks a winner. */
export function compareOperations(
  a: Pick<Operation, 'lamport' | 'originDeviceId' | 'originSequence'>,
  b: Pick<Operation, 'lamport' | 'originDeviceId' | 'originSequence'>
): number {
  if (a.lamport !== b.lamport) return a.lamport > b.lamport ? 1 : -1;
  if (a.originDeviceId !== b.originDeviceId)
    return a.originDeviceId > b.originDeviceId ? 1 : -1;
  return a.originSequence === b.originSequence
    ? 0
    : a.originSequence > b.originSequence
      ? 1
      : -1;
}
