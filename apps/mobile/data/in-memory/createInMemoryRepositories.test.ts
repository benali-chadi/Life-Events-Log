import type { RepositoryDependencies } from '@/data/repositories';
import { describe, expect, it } from 'vitest';
import { createInMemoryRepositories } from './createInMemoryRepositories';

function sequentialDependencies(): RepositoryDependencies {
  let nextId = 0;

  return {
    createId: () => `generated-${++nextId}`,
    now: () => '2026-07-31T12:00:00.000Z',
  };
}

describe('createInMemoryRepositories', () => {
  it('composes every repository over one shared database', async () => {
    const repositories = createInMemoryRepositories({
      dependencies: sequentialDependencies(),
    });
    const tag = await repositories.tags.create({ name: 'shared tag' });
    const category = await repositories.categories.create({
      name: 'Shared category',
      color: 'blue',
    });
    const person = await repositories.people.create({ name: 'Shared person' });
    const location = await repositories.locations.create({
      name: 'Shared location',
    });
    const details = await repositories.events.create({
      title: 'Shared event',
      date: '2026-07-31',
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
      contentHash: 'a'.repeat(64),
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

  it('creates isolated databases for separate repository containers', async () => {
    const first = createInMemoryRepositories({
      dependencies: sequentialDependencies(),
    });
    const second = createInMemoryRepositories({
      dependencies: sequentialDependencies(),
    });
    const tag = await first.tags.create({ name: 'First container only' });

    await expect(first.tags.getById(tag.id)).resolves.toMatchObject({
      name: 'First container only',
    });
    await expect(second.tags.getById(tag.id)).resolves.toBeNull();
  });
});
