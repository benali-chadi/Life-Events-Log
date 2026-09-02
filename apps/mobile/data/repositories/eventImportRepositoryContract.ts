import { describe, expect, it } from 'vitest';
import type { CommitEventImportInput, Repositories } from '@/data/repositories';

type RepositoryFactory = () => Promise<Repositories>;

export function eventImportRepositoryContract(
  implementation: string,
  createRepositories: RepositoryFactory
) {
  describe(`${implementation} EventImportRepository`, () => {
    it('atomically creates events, missing metadata, and relationships', async () => {
      const repositories = await createRepositories();
      const existingTag = await repositories.tags.create({ name: 'Existing' });
      const category = await repositories.categories.create({
        name: 'Imported',
        color: 'blue',
      });
      const result = await repositories.eventImports.commit({
        category: { kind: 'existing', id: category.id },
        newMetadata: {
          tags: [{ temporaryId: 'new:tag:travel', name: 'Travel' }],
          people: [{ temporaryId: 'new:person:youssef', name: 'Youssef' }],
          locations: [{ temporaryId: 'new:location:rabat', name: 'Rabat' }],
        },
        events: [
          importEvent({
            tags: [
              { kind: 'existing', id: existingTag.id },
              { kind: 'new', temporaryId: 'new:tag:travel' },
              { kind: 'new', temporaryId: 'new:tag:travel' },
            ],
            people: [{ kind: 'new', temporaryId: 'new:person:youssef' }],
            location: {
              kind: 'new',
              temporaryId: 'new:location:rabat',
            },
          }),
          importEvent({
            title: 'Second event',
            date: '2026-09-02',
            tags: [{ kind: 'new', temporaryId: 'new:tag:travel' }],
          }),
        ],
      });

      expect(result).toEqual({
        eventCount: 2,
        createdMetadata: {
          categoryCount: 0,
          tagCount: 1,
          peopleCount: 1,
          locationCount: 1,
        },
      });
      const imported = await repositories.events.list({ limit: 10 });
      expect(imported.items).toHaveLength(2);
      const first = imported.items.find(
        (item) => item.event.title === 'Imported event'
      );
      expect(first).toMatchObject({
        category: { id: category.id },
        location: { name: 'Rabat' },
        tags: [{ id: existingTag.id }, { name: 'Travel' }],
        people: [{ name: 'Youssef' }],
      });
    });

    it('reuses metadata that now matches a proposed definition', async () => {
      const repositories = await createRepositories();
      const concurrentTag = await repositories.tags.create({ name: 'travel' });
      const result = await repositories.eventImports.commit({
        category: null,
        newMetadata: {
          tags: [{ temporaryId: 'new:tag:travel', name: ' Travel ' }],
          people: [],
          locations: [],
        },
        events: [
          importEvent({
            tags: [{ kind: 'new', temporaryId: 'new:tag:travel' }],
          }),
        ],
      });

      expect(result.createdMetadata.tagCount).toBe(0);
      const imported = await repositories.events.list({ limit: 1 });
      expect(imported.items[0]?.tags).toEqual([concurrentTag]);
      await expect(repositories.tags.list()).resolves.toHaveLength(1);
    });

    it('creates a proposed category in the same commit and assigns it to every event', async () => {
      const repositories = await createRepositories();
      const result = await repositories.eventImports.commit({
        category: { kind: 'new', name: 'Calendar import', color: 'teal' },
        newMetadata: { tags: [], people: [], locations: [] },
        events: [importEvent(), importEvent({ title: 'Second event' })],
      });

      expect(result).toMatchObject({
        eventCount: 2,
        createdMetadata: { categoryCount: 1 },
      });
      const categories = await repositories.categories.list();
      expect(categories).toMatchObject([
        { name: 'Calendar import', color: 'teal' },
      ]);
      const imported = await repositories.events.list({ limit: 10 });
      expect(
        imported.items.every((item) => item.category?.id === categories[0]?.id)
      ).toBe(true);
    });

    it('rolls back metadata and events when a temporary reference is invalid', async () => {
      const repositories = await createRepositories();
      const input: CommitEventImportInput = {
        category: { kind: 'new', name: 'Should roll back', color: 'rose' },
        newMetadata: {
          tags: [{ temporaryId: 'defined', name: 'Should roll back' }],
          people: [],
          locations: [],
        },
        events: [
          importEvent({
            tags: [{ kind: 'new', temporaryId: 'missing' }],
          }),
        ],
      };

      await expect(repositories.eventImports.commit(input)).rejects.toThrow(
        'has no definition'
      );
      await expect(repositories.tags.list()).resolves.toEqual([]);
      await expect(repositories.categories.list()).resolves.toEqual([]);
      await expect(repositories.events.count({ limit: 1 })).resolves.toBe(0);
    });

    it('rejects stale existing metadata and category references', async () => {
      const repositories = await createRepositories();
      await expect(
        repositories.eventImports.commit({
          category: { kind: 'existing', id: 'missing-category' },
          newMetadata: { tags: [], people: [], locations: [] },
          events: [
            importEvent({
              tags: [{ kind: 'existing', id: 'missing-tag' }],
            }),
          ],
        })
      ).rejects.toThrow(/not found/);
      await expect(repositories.events.count({ limit: 1 })).resolves.toBe(0);
    });

    it('validates every event before changing state', async () => {
      const repositories = await createRepositories();
      await expect(
        repositories.eventImports.commit({
          category: null,
          newMetadata: {
            tags: [{ temporaryId: 'new-tag', name: 'New tag' }],
            people: [],
            locations: [],
          },
          events: [importEvent(), importEvent({ title: '   ' })],
        })
      ).rejects.toThrow('title cannot be empty');
      await expect(repositories.tags.list()).resolves.toEqual([]);
      await expect(repositories.events.count({ limit: 1 })).resolves.toBe(0);
    });
  });
}

function importEvent(
  overrides: Partial<CommitEventImportInput['events'][number]> = {}
): CommitEventImportInput['events'][number] {
  return {
    title: 'Imported event',
    date: '2026-09-01',
    time: '09:30',
    significance: 'ordinary',
    notes: 'Imported notes',
    tags: [],
    people: [],
    location: null,
    ...overrides,
  };
}
