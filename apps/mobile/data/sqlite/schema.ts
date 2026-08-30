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
