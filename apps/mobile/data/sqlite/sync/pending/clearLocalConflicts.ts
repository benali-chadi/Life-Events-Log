import { and, eq, inArray } from 'drizzle-orm';
import type { SyncTransaction } from '../../database';
import { syncConflicts } from '../../schema';
import type { CreateOperationInput, DomainFieldName } from '../types';
import { winningFieldsFor } from '../entityFields';

/** Local intent acknowledges alternatives; incoming operations use causal resolution. */
export function clearLocalConflicts(
  input: CreateOperationInput,
  tx: SyncTransaction
): void {
  if (
    input.operationType !== 'entity.patch' &&
    input.operationType !== 'entity.delete'
  )
    return;
  const entityWhere = and(
    eq(syncConflicts.entityType, input.entityType),
    eq(syncConflicts.entityId, input.entityId)
  );
  if (input.operationType === 'entity.delete') {
    tx.delete(syncConflicts).where(entityWhere).run();
    return;
  }
  // Entity patches only target domain fields, never the attachment_order pseudo-field.
  const fields = winningFieldsFor(input) as DomainFieldName[];
  if (fields.length) {
    tx.delete(syncConflicts)
      .where(and(entityWhere, inArray(syncConflicts.fieldName, fields)))
      .run();
  }
}
