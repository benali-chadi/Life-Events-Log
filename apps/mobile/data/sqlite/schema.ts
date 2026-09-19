import { sql } from 'drizzle-orm';
import type {
  CausalContext,
  ConflictStatus,
  DomainFieldName,
  OperationPayload,
  OperationType,
  SyncEntityType,
  SyncFieldName,
} from './sync/types';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';
import {
  CATEGORY_COLOR_VALUES,
  EVENT_SIGNIFICANCE_VALUES,
  EVENT_TITLE_MAX_LENGTH,
  type CategoryColor,
  type EventSignificance,
  type LocalDate,
  type LocalTime,
} from '@/models';

const syncTimestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
};

const categoryColorSql = sql.raw(
  CATEGORY_COLOR_VALUES.map((color) => `'${color}'`).join(', ')
);
const eventSignificanceSql = sql.raw(
  EVENT_SIGNIFICANCE_VALUES.map((value) => `'${value}'`).join(', ')
);

function activeNameIndex(
  name: string,
  table: { normalizedName: AnySQLiteColumn; deletedAt: AnySQLiteColumn }
) {
  return uniqueIndex(name)
    .on(table.normalizedName)
    .where(sql`${table.deletedAt} IS NULL`);
}

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull().default(''),
    color: text('color').$type<CategoryColor>().notNull(),
    ...syncTimestamps,
  },
  (table) => [
    activeNameIndex('categories_active_normalized_name_unique', table),
    check(
      'categories_color_check',
      sql`${table.color} IN (${categoryColorSql})`
    ),
  ]
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull().default(''),
    ...syncTimestamps,
  },
  (table) => [activeNameIndex('tags_active_normalized_name_unique', table)]
);

export const people = sqliteTable(
  'people',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull().default(''),
    ...syncTimestamps,
  },
  (table) => [activeNameIndex('people_active_normalized_name_unique', table)]
);

export const locations = sqliteTable(
  'locations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull().default(''),
    ...syncTimestamps,
  },
  (table) => [activeNameIndex('locations_active_normalized_name_unique', table)]
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    normalizedTitle: text('normalized_title').notNull().default(''),
    date: text('date').$type<LocalDate>().notNull(),
    time: text('time').$type<LocalTime>(),
    significance: text('significance').$type<EventSignificance>().notNull(),
    categoryId: text('category_id').references(() => categories.id),
    locationId: text('location_id').references(() => locations.id),
    notes: text('notes').notNull(),
    ...syncTimestamps,
  },
  (table) => [
    index('events_timeline_idx').on(
      table.deletedAt,
      table.date,
      table.time,
      table.createdAt,
      table.id
    ),
    index('events_category_idx').on(table.categoryId, table.deletedAt),
    index('events_location_idx').on(table.locationId, table.deletedAt),
    index('events_normalized_title_idx').on(
      table.normalizedTitle,
      table.deletedAt
    ),
    check(
      'events_title_length_check',
      sql`length(${table.title}) <= ${sql.raw(String(EVENT_TITLE_MAX_LENGTH))}`
    ),
    check(
      'events_significance_check',
      sql`${table.significance} IN (${eventSignificanceSql})`
    ),
  ]
);

export const eventAttachments = sqliteTable(
  'event_attachments',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    contentHash: text('content_hash').notNull(),
    filename: text('filename').notNull(),
    mimeType: text('mime_type'),
    width: integer('width'),
    height: integer('height'),
    fileSize: integer('file_size'),
    sortOrder: integer('sort_order').notNull(),
    ...syncTimestamps,
  },
  (table) => [
    index('event_attachments_event_order_idx').on(
      table.eventId,
      table.deletedAt,
      table.sortOrder,
      table.id
    ),
    check(
      'event_attachments_width_check',
      sql`${table.width} IS NULL OR ${table.width} >= 0`
    ),
    check(
      'event_attachments_height_check',
      sql`${table.height} IS NULL OR ${table.height} >= 0`
    ),
    check(
      'event_attachments_file_size_check',
      sql`${table.fileSize} IS NULL OR ${table.fileSize} >= 0`
    ),
    check('event_attachments_sort_order_check', sql`${table.sortOrder} >= 0`),
    check(
      'event_attachments_content_hash_check',
      sql`length(${table.contentHash}) = 64 AND ${table.contentHash} NOT GLOB '*[^0-9a-f]*'`
    ),
  ]
);

export const eventTags = sqliteTable(
  'event_tags',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id),
    ...syncTimestamps,
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.tagId] }),
    index('event_tags_tag_idx').on(table.tagId, table.deletedAt, table.eventId),
  ]
);

export const eventPeople = sqliteTable(
  'event_people',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => events.id),
    personId: text('person_id')
      .notNull()
      .references(() => people.id),
    ...syncTimestamps,
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.personId] }),
    index('event_people_person_idx').on(
      table.personId,
      table.deletedAt,
      table.eventId
    ),
  ]
);

export const categoryModelColumns = {
  id: categories.id,
  name: categories.name,
  color: categories.color,
  createdAt: categories.createdAt,
  updatedAt: categories.updatedAt,
  deletedAt: categories.deletedAt,
};

export const tagModelColumns = {
  id: tags.id,
  name: tags.name,
  createdAt: tags.createdAt,
  updatedAt: tags.updatedAt,
  deletedAt: tags.deletedAt,
};

export const personModelColumns = {
  id: people.id,
  name: people.name,
  createdAt: people.createdAt,
  updatedAt: people.updatedAt,
  deletedAt: people.deletedAt,
};

export const locationModelColumns = {
  id: locations.id,
  name: locations.name,
  createdAt: locations.createdAt,
  updatedAt: locations.updatedAt,
  deletedAt: locations.deletedAt,
};

export const eventModelColumns = {
  id: events.id,
  title: events.title,
  date: events.date,
  time: events.time,
  significance: events.significance,
  categoryId: events.categoryId,
  locationId: events.locationId,
  notes: events.notes,
  createdAt: events.createdAt,
  updatedAt: events.updatedAt,
  deletedAt: events.deletedAt,
};

export type EventRow = typeof events.$inferSelect;
export type EventAttachmentRow = typeof eventAttachments.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type PersonRow = typeof people.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type EventTagRow = typeof eventTags.$inferSelect;
export type EventPersonRow = typeof eventPeople.$inferSelect;

// A constant-expression unique index enforces a singleton without an extra column.
export const syncLocalState = sqliteTable(
  'sync_local_state',
  {
    deviceId: text('device_id').primaryKey(),
    observedLamport: integer('observed_lamport').notNull(),
  },
  (table) => [
    uniqueIndex('sync_local_state_singleton').on(sql`(1)`),
    check('sync_local_state_lamport_check', sql`${table.observedLamport} >= 0`),
  ]
);

export const syncFrontiers = sqliteTable(
  'sync_frontiers',
  {
    originDeviceId: text('origin_device_id').primaryKey(),
    processedSequence: integer('processed_sequence').notNull(),
  },
  (table) => [
    check(
      'sync_frontiers_sequence_check',
      sql`${table.processedSequence} >= 0`
    ),
  ]
);

export const syncOperations = sqliteTable(
  'sync_operations',
  {
    originDeviceId: text('origin_device_id').notNull(),
    originSequence: integer('origin_sequence').notNull(),
    lamport: integer('lamport').notNull(),
    causalContext: text('causal_context', { mode: 'json' })
      .$type<CausalContext>()
      .notNull(),
    operationType: text('operation_type').$type<OperationType>().notNull(),
    entityType: text('entity_type').$type<SyncEntityType>().notNull(),
    entityId: text('entity_id').notNull(),
    payload: text('payload', { mode: 'json' })
      .$type<OperationPayload>()
      .notNull(),
    operationHash: text('operation_hash').notNull(),
    receivedAt: text('received_at').notNull(),
    appliedAt: text('applied_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.originDeviceId, table.originSequence] }),
    index('sync_operations_entity_operation_idx').on(
      table.entityType,
      table.entityId,
      table.operationType
    ),
    check('sync_operations_sequence_check', sql`${table.originSequence} > 0`),
    check('sync_operations_lamport_check', sql`${table.lamport} > 0`),
  ]
);

/** Local, mutable intents. Distinct operation types may coexist for one entity. */
export const syncPendingOperations = sqliteTable(
  'sync_pending_operations',
  {
    operationType: text('operation_type').$type<OperationType>().notNull(),
    entityType: text('entity_type').$type<SyncEntityType>().notNull(),
    entityId: text('entity_id').notNull(),
    payload: text('payload', { mode: 'json' })
      .$type<OperationPayload>()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.entityId, table.entityType, table.operationType],
    }),
  ]
);

export const syncFieldVersions = sqliteTable(
  'sync_field_versions',
  {
    entityType: text('entity_type').$type<SyncEntityType>().notNull(),
    entityId: text('entity_id').notNull(),
    fieldName: text('field_name').$type<SyncFieldName>().notNull(),
    winnerDeviceId: text('winner_device_id').notNull(),
    winnerSequence: integer('winner_sequence').notNull(),
    winnerLamport: integer('winner_lamport').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.entityType, table.entityId, table.fieldName],
    }),
    check(
      'sync_field_versions_sequence_check',
      sql`${table.winnerSequence} > 0`
    ),
    check('sync_field_versions_lamport_check', sql`${table.winnerLamport} > 0`),
  ]
);

export const syncConflicts = sqliteTable(
  'sync_conflicts',
  {
    conflictId: text('conflict_id').primaryKey(),
    entityType: text('entity_type').$type<SyncEntityType>().notNull(),
    entityId: text('entity_id').notNull(),
    fieldName: text('field_name').$type<DomainFieldName>().notNull(),
    winningDeviceId: text('winning_device_id').notNull(),
    winningSequence: integer('winning_sequence').notNull(),
    losingDeviceId: text('losing_device_id').notNull(),
    losingSequence: integer('losing_sequence').notNull(),
    status: text('status').$type<ConflictStatus>().notNull(),
    resolutionDeviceId: text('resolution_device_id'),
    resolutionSequence: integer('resolution_sequence'),
  },
  (table) => [
    check(
      'sync_conflicts_status_check',
      sql`${table.status} IN ('pending', 'resolved')`
    ),
    check(
      'sync_conflicts_resolution_check',
      sql`(${table.resolutionDeviceId} IS NULL AND ${table.resolutionSequence} IS NULL) OR (${table.resolutionDeviceId} IS NOT NULL AND ${table.resolutionSequence} > 0 AND ${table.resolutionSequence} IS NOT NULL)`
    ),
    check(
      'sync_conflicts_sequences_check',
      sql`${table.winningSequence} > 0 AND ${table.losingSequence} > 0`
    ),
  ]
);

export type SyncLocalState = typeof syncLocalState.$inferSelect;
export type SyncFrontier = typeof syncFrontiers.$inferSelect;
export type SyncOperationRow = typeof syncOperations.$inferSelect;
export type SyncPendingOperationRow = typeof syncPendingOperations.$inferSelect;
export type SyncFieldVersion = typeof syncFieldVersions.$inferSelect;
export type SyncConflict = typeof syncConflicts.$inferSelect;
