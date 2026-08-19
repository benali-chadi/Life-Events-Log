import type { Database } from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RepositoryDependencies } from '@/data/repositories';
import type { AppDatabase } from './database';
import { createSQLiteRepositories } from './createSQLiteRepositories';
import { createTestDatabase } from './testing/createTestDatabase';

const NOW = '2026-08-19T10:00:00.000Z';
const ids = [
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
];

describe('createSQLiteRepositories', () => {
  let sqlite: Database;
  let database: AppDatabase;

  beforeEach(async () => {
    ({ sqlite, database } = await createTestDatabase());
  });

  afterEach(() => sqlite.close());

  it('creates a repository bundle sharing one SQLite database', async () => {
    let idIndex = 0;
    const dependencies: RepositoryDependencies = {
      createId: () => ids[idIndex++]!,
      now: () => NOW,
    };
    const repositories = createSQLiteRepositories(database, dependencies);
    const category = await repositories.categories.create({
      name: 'Personal',
      color: 'magenta',
    });
    const tag = await repositories.tags.create({ name: 'Family' });
    const person = await repositories.people.create({ name: 'Leila' });
    const location = await repositories.locations.create({ name: 'Rabat' });
    const details = await repositories.events.create({
      title: 'Shared database',
      date: '2026-08-19',
      time: null,
      significance: 'ordinary',
      categoryId: category.id,
      locationId: location.id,
      notes: '',
      tagIds: [tag.id],
      peopleIds: [person.id],
    });
    const attachment = await repositories.attachments.create({
      eventId: details.event.id,
      relativePath: 'attachments/photo.jpg',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      width: 100,
      height: 100,
      fileSize: 1_000,
    });

    await expect(
      repositories.events.getDetailsById(details.event.id)
    ).resolves.toMatchObject({
      category: { id: category.id },
      location: { id: location.id },
      tags: [{ id: tag.id }],
      people: [{ id: person.id }],
      attachments: [{ id: attachment.id }],
    });
  });
});
