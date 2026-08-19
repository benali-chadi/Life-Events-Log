import { sql } from 'drizzle-orm';
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

function activeNormalizedNameIndex(
  name: string,
  table: { name: AnySQLiteColumn; deletedAt: AnySQLiteColumn }
) {
  return uniqueIndex(name)
    .on(sql`lower(${table.name})`)
    .where(sql`${table.deletedAt} IS NULL`);
}

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    color: text('color').$type<CategoryColor>().notNull(),
    ...syncTimestamps,
  },
  (table) => [
    activeNormalizedNameIndex('categories_active_name_unique', table),
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
    ...syncTimestamps,
  },
  (table) => [activeNormalizedNameIndex('tags_active_name_unique', table)]
);

export const people = sqliteTable(
  'people',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    ...syncTimestamps,
  },
  (table) => [activeNormalizedNameIndex('people_active_name_unique', table)]
);

export const locations = sqliteTable(
  'locations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    ...syncTimestamps,
  },
  (table) => [activeNormalizedNameIndex('locations_active_name_unique', table)]
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
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
    relativePath: text('relative_path').notNull(),
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

export type EventRow = typeof events.$inferSelect;
export type EventAttachmentRow = typeof eventAttachments.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type PersonRow = typeof people.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type EventTagRow = typeof eventTags.$inferSelect;
export type EventPersonRow = typeof eventPeople.$inferSelect;
