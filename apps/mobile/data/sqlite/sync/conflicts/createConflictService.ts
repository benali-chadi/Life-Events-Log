import { and, eq, isNull, ne } from 'drizzle-orm';
import {
  DuplicateNameError,
  EntityNotFoundError,
} from '@/data/repositories/errors';
import { comparableMetadataName } from '@/data/repositories/metadataName';
import type { AppDatabase, SyncTransaction } from '../../database';
import {
  events,
  categories,
  tags,
  people,
  locations,
  syncConflicts,
  syncOperations,
} from '../../schema';
import { applyPendingOperation } from '../pending/applyPendingOperation';
import { reviewFields } from '../entityFields';
import type { CreateOperationInput, Operation } from '../types';
import { OperationValidationError } from '../validation/OperationValidationError';

const tables = {
  event: events,
  category: categories,
  tag: tags,
  person: people,
  location: locations,
};
export type ConflictEntityType = keyof typeof tables;
export type ConflictChoice = 'current' | 'alternative';
export type FieldConflict = {
  conflictId: string;
  entityType: ConflictEntityType;
  entityId: string;
  fieldName: string;
  currentValue: string | null;
  alternativeValue: string | null;
};
export type ResolveConflictResult =
  | { status: 'already-resolved' }
  | { status: 'resolved'; entityType: ConflictEntityType; entityId: string };

function conflictValues(
  row: typeof syncConflicts.$inferSelect,
  tx: SyncTransaction
): FieldConflict {
  if (
    !Object.hasOwn(tables, row.entityType) ||
    !reviewFields[row.entityType as ConflictEntityType].includes(row.fieldName)
  )
    throw new OperationValidationError('Unsupported review conflict.');
  const value = (deviceId: string, sequence: number): string | null => {
    const operation = tx
      .select()
      .from(syncOperations)
      .where(
        and(
          eq(syncOperations.originDeviceId, deviceId),
          eq(syncOperations.originSequence, sequence)
        )
      )
      .get() as Operation | undefined;
    if (
      !operation ||
      operation.entityType !== row.entityType ||
      operation.entityId !== row.entityId ||
      (operation.operationType !== 'entity.create' &&
        operation.operationType !== 'entity.patch')
    )
      throw new OperationValidationError(
        'Conflict points to invalid operation history.'
      );
    const payload =
      operation.operationType === 'entity.patch'
        ? operation.payload.changes
        : operation.payload;
    const fieldValue = (payload as Record<string, unknown>)[row.fieldName];
    if (
      !Object.hasOwn(payload, row.fieldName) ||
      (fieldValue !== null && typeof fieldValue !== 'string')
    )
      throw new OperationValidationError(
        'Conflict history is missing its field value.'
      );
    return fieldValue;
  };
  return {
    conflictId: row.conflictId,
    entityType: row.entityType as ConflictEntityType,
    entityId: row.entityId,
    fieldName: row.fieldName,
    currentValue: value(row.winningDeviceId, row.winningSequence),
    alternativeValue: value(row.losingDeviceId, row.losingSequence),
  };
}

export function createConflictService(
  database: AppDatabase,
  { now }: { now(): string }
) {
  return {
    getConflicts(
      entityType: ConflictEntityType,
      entityId?: string
    ): FieldConflict[] {
      return database.transaction((tx) =>
        tx
          .select()
          .from(syncConflicts)
          .where(
            and(
              eq(syncConflicts.entityType, entityType),
              entityId === undefined
                ? undefined
                : eq(syncConflicts.entityId, entityId),
              eq(syncConflicts.status, 'pending')
            )
          )
          .all()
          .map((row) => conflictValues(row, tx))
      );
    },
    resolveConflict(
      conflictId: string,
      choice: ConflictChoice
    ): ResolveConflictResult {
      return database.transaction((tx) => {
        const row = tx
          .select()
          .from(syncConflicts)
          .where(
            and(
              eq(syncConflicts.conflictId, conflictId),
              eq(syncConflicts.status, 'pending')
            )
          )
          .get();
        if (!row) return { status: 'already-resolved' };
        if (choice !== 'current' && choice !== 'alternative')
          throw new OperationValidationError('Invalid conflict choice.');
        const conflict = conflictValues(row, tx);
        const { entityType, entityId, fieldName } = conflict;
        const table = tables[entityType];
        const entity = tx
          .select()
          .from(table)
          .where(and(eq(table.id, entityId), isNull(table.deletedAt)))
          .get();
        if (!entity) throw new EntityNotFoundError(entityType, entityId);
        const selected =
          choice === 'current'
            ? conflict.currentValue
            : conflict.alternativeValue;
        if (
          entityType !== 'event' &&
          fieldName === 'name' &&
          typeof selected === 'string'
        ) {
          const metadata = tables[entityType];
          const existingName = (entity as { name: string }).name;
          if (
            comparableMetadataName(selected) !==
              comparableMetadataName(existingName) &&
            tx
              .select({ id: metadata.id })
              .from(metadata)
              .where(
                and(
                  isNull(metadata.deletedAt),
                  ne(metadata.id, entityId),
                  eq(metadata.normalizedName, comparableMetadataName(selected))
                )
              )
              .get()
          )
            throw new DuplicateNameError(entityType, selected);
        }
        // The field whitelist above and applyPendingOperation's payload validator
        // guard the dynamically constructed single-field patch.
        applyPendingOperation(
          {
            operationType: 'entity.patch',
            entityType,
            entityId,
            payload: { changes: { [fieldName]: selected }, updatedAt: now() },
          } as Extract<CreateOperationInput, { operationType: 'entity.patch' }>,
          tx
        );
        return { status: 'resolved', entityType, entityId };
      });
    },
  };
}
