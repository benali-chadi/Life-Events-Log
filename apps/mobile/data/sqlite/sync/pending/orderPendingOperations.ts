import type { PendingOperation } from '../types';

function phase(operation: PendingOperation): number {
  switch (operation.operationType) {
    case 'entity.create':
      return operation.entityType === 'event' ? 1 : 0;
    case 'attachment.create':
      return 2;
    case 'entity.patch':
      return 3;
    case 'relation.add':
      return 4;
    case 'relation.remove':
      return 5;
    case 'event.attachment.reorder':
      return 6;
    case 'entity.delete':
    case 'attachment.delete':
      return 7;
  }
}

const compare = (a: string, b: string) => (a === b ? 0 : a < b ? -1 : 1);

/** Dependency phases for the current vocabulary; never rely on wall clocks or insertion order. */
export function orderPendingOperations(
  operations: readonly PendingOperation[]
): PendingOperation[] {
  return [...operations].sort(
    (a, b) =>
      phase(a) - phase(b) ||
      compare(a.entityType, b.entityType) ||
      compare(a.entityId, b.entityId)
  );
}
