import { sql } from 'drizzle-orm';
import { normalizeSearchText } from '@/data/repositories/metadataName';
import type { AppDatabase } from './database';
import { categories, events, locations, people, tags } from './schema';

const NORMALIZED_SEARCH_VALUES = 'normalized-search-values-v1';

export function runDataMigrations(database: AppDatabase) {
  const applied = database
    .select({ key: sql<string>`key` })
    .from(sql`app_data_migrations`)
    .where(sql`key = ${NORMALIZED_SEARCH_VALUES}`)
    .get();

  if (applied) return;

  database.transaction((transaction) => {
    const metadataTables = [categories, tags, people, locations] as const;

    for (const table of metadataTables) {
      const rows = transaction
        .select({ id: table.id, name: table.name })
        .from(table)
        .all();

      for (const row of rows) {
        transaction
          .update(table)
          .set({ normalizedName: normalizeSearchText(row.name) })
          .where(sql`${table.id} = ${row.id}`)
          .run();
      }
    }

    const eventRows = transaction
      .select({ id: events.id, title: events.title })
      .from(events)
      .all();

    for (const event of eventRows) {
      transaction
        .update(events)
        .set({ normalizedTitle: normalizeSearchText(event.title) })
        .where(sql`${events.id} = ${event.id}`)
        .run();
    }

    transaction.run(sql`
      INSERT INTO app_data_migrations (key, applied_at)
      VALUES (${NORMALIZED_SEARCH_VALUES}, ${new Date().toISOString()})
    `);
  });
}
