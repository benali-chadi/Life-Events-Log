import { eq, sql } from 'drizzle-orm';
import { EntityNotFoundError } from '@/data/repositories';
import { normalizeSearchText } from '@/data/repositories/metadataName';
import type { SyncTransaction } from '../../database';
import { events, categories, tags, people, locations } from '../../schema';
import type { Operation, SyncFieldName } from '../types';
import { entityFields } from '../entityFields';
import { createEvent } from './createEvent';

const tables = {
  event: events,
  category: categories,
  tag: tags,
  person: people,
  location: locations,
};
type EntityCreate = Extract<Operation, { operationType: 'entity.create' }>;
type EntityPatch = Extract<Operation, { operationType: 'entity.patch' }>;
type EntityDelete = Extract<Operation, { operationType: 'entity.delete' }>;

export function createEntity(
  operation: EntityCreate,
  tx: SyncTransaction
): void {
  if (operation.entityType === 'event') return createEvent(operation, tx);
  const common = {
    id: operation.entityId,
    deletedAt: null,
    normalizedName: normalizeSearchText(operation.payload.name),
  };
  if (operation.entityType === 'category') {
    tx.insert(categories)
      .values({ ...operation.payload, ...common })
      .run();
  } else {
    tx.insert(tables[operation.entityType])
      .values({ ...operation.payload, ...common })
      .run();
  }
}

/** Only selected fields and their derived columns are written. */
export function patchEntity(
  operation: EntityPatch,
  winningFields: readonly SyncFieldName[],
  tx: SyncTransaction
): void {
  const mapping: Readonly<Record<string, SyncFieldName>> =
    entityFields[operation.entityType];
  const changes = Object.fromEntries(
    Object.entries(operation.payload.changes).filter(([key]) =>
      winningFields.includes(mapping[key]!)
    )
  );
  const table = tables[operation.entityType];
  if (
    !tx
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, operation.entityId))
      .get()
  )
    throw new EntityNotFoundError(operation.entityType, operation.entityId);
  const derived =
    typeof changes.title === 'string'
      ? { normalizedTitle: normalizeSearchText(changes.title) }
      : typeof changes.name === 'string'
        ? { normalizedName: normalizeSearchText(changes.name) }
        : {};
  tx.update(table)
    .set({
      ...changes,
      ...derived,
      updatedAt: sql`max(${table.updatedAt}, ${operation.payload.updatedAt})`,
    })
    .where(eq(table.id, operation.entityId))
    .run();
}

export function deleteEntity(
  operation: EntityDelete,
  winningFields: readonly SyncFieldName[],
  tx: SyncTransaction
): void {
  const table = tables[operation.entityType];
  if (
    !tx
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, operation.entityId))
      .get()
  )
    throw new EntityNotFoundError(operation.entityType, operation.entityId);
  tx.update(table)
    .set({
      ...(winningFields.includes('deleted_at')
        ? { deletedAt: operation.payload.deletedAt }
        : {}),
      updatedAt: sql`max(${table.updatedAt}, ${operation.payload.deletedAt})`,
    })
    .where(eq(table.id, operation.entityId))
    .run();
}
