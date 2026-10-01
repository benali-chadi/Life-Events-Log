import { and, eq } from 'drizzle-orm';
import type { AppDatabase } from '../../database';
import {
  categories,
  tags,
  syncFieldVersions,
  syncLocalState,
} from '../../schema';
import { defaultOperations, DEFAULTS_ORIGIN } from './defaultOperations';
import { validateOperation } from '../validation/validateOperation';
import { applyDomainMutation } from '../applyDomainMutation';
import {
  appendOperation,
  type AppendOperationDependencies,
} from '../recording/appendOperation';
import { createOperation } from '../createOperation';
import type { CreateOperationInput, SyncFieldName } from '../types';
import { winningFieldsFor } from '../entityFields';

/** Adopt historical SQL seeds without overwriting edits or resurrecting rows.
 * All history/version changes and any missing seed inserts are atomic.
 */
export function bootstrapDefaults(
  database: AppDatabase,
  dependencies?: AppendOperationDependencies
): void {
  database.transaction((tx) => {
    const local = tx.select().from(syncLocalState).get();
    if (!local || local.deviceId === DEFAULTS_ORIGIN)
      throw new Error(
        'Defaults bootstrap requires an initialized, independent local replica.'
      );
    const legacyChanges: CreateOperationInput[] = [];
    for (const operation of defaultOperations()) {
      if (validateOperation(operation, tx).status === 'already-applied')
        continue;
      if (
        operation.operationType !== 'entity.create' ||
        (operation.entityType !== 'category' && operation.entityType !== 'tag')
      )
        throw new Error('Unsupported defaults bootstrap operation.');
      const table = operation.entityType === 'category' ? categories : tags;
      const existing = tx
        .select()
        .from(table)
        .where(eq(table.id, operation.entityId))
        .get();
      const fields = winningFieldsFor(operation);
      if (!existing) {
        applyDomainMutation(operation, fields, tx);
        appendOperation(operation, tx, fields, dependencies);
        continue;
      }
      const versions = new Set(
        tx
          .select()
          .from(syncFieldVersions)
          .where(
            and(
              eq(syncFieldVersions.entityType, operation.entityType),
              eq(syncFieldVersions.entityId, operation.entityId)
            )
          )
          .all()
          .map((row) => row.fieldName)
      );
      // Existing operation-backed winners must not be replaced by seed history.
      const seedFields: SyncFieldName[] = [];
      const changedName =
        !versions.has('name') && existing.name !== operation.payload.name;
      if (!versions.has('name') && !changedName) seedFields.push('name');
      if (!versions.has('deleted_at') && existing.deletedAt === null)
        seedFields.push('deleted_at');
      if (operation.entityType === 'category' && 'color' in existing) {
        const changedColor =
          !versions.has('color') && existing.color !== operation.payload.color;
        if (!versions.has('color') && !changedColor) seedFields.push('color');
        if (changedName || changedColor)
          legacyChanges.push({
            operationType: 'entity.patch',
            entityType: 'category',
            entityId: existing.id,
            payload: {
              changes: {
                ...(changedName ? { name: existing.name } : {}),
                ...(changedColor ? { color: existing.color } : {}),
              },
              updatedAt: existing.updatedAt,
            },
          });
      } else if (changedName) {
        legacyChanges.push({
          operationType: 'entity.patch',
          entityType: 'tag',
          entityId: existing.id,
          payload: {
            changes: { name: existing.name },
            updatedAt: existing.updatedAt,
          },
        });
      }
      if (!versions.has('deleted_at') && existing.deletedAt !== null)
        legacyChanges.push({
          operationType: 'entity.delete',
          entityType: operation.entityType,
          entityId: existing.id,
          payload: { deletedAt: existing.deletedAt },
        });
      appendOperation(operation, tx, seedFields, dependencies);
    }
    // These mutations already exist in domain tables. Record, don't reapply.
    for (const input of legacyChanges) {
      const operation = createOperation(input, tx);
      validateOperation(operation, tx);
      appendOperation(operation, tx, winningFieldsFor(operation), dependencies);
    }
  });
}
