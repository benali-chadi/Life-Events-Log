import type { InMemorySeed } from './types';

const CREATED_AT = '2026-07-01T12:00:00.000Z';

const ids = {
  categories: {
    personal: '10000000-0000-4000-8000-000000000001',
    projects: '10000000-0000-4000-8000-000000000002',
  },
  tags: {
    development: '20000000-0000-4000-8000-000000000001',
    localFirst: '20000000-0000-4000-8000-000000000002',
  },
  people: {
    mounir: '30000000-0000-4000-8000-000000000001',
  },
  locations: {
    rabat: '40000000-0000-4000-8000-000000000001',
  },
  events: {
    projectStarted: '50000000-0000-4000-8000-000000000001',
    coffee: '50000000-0000-4000-8000-000000000002',
  },
} as const;

export const EMPTY_IN_MEMORY_SEED: InMemorySeed = {};

export const DEVELOPMENT_SEED = {
  categories: [
    {
      id: ids.categories.personal,
      name: 'Personal',
      color: 'green',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      deletedAt: null,
    },
    {
      id: ids.categories.projects,
      name: 'Projects',
      color: 'blue',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      deletedAt: null,
    },
  ],
  tags: [
    {
      id: ids.tags.development,
      name: 'development',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      deletedAt: null,
    },
    {
      id: ids.tags.localFirst,
      name: 'local-first',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      deletedAt: null,
    },
  ],
  people: [
    {
      id: ids.people.mounir,
      name: 'Mounir',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      deletedAt: null,
    },
  ],
  locations: [
    {
      id: ids.locations.rabat,
      name: 'Rabat',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      deletedAt: null,
    },
  ],
  events: [
    {
      id: ids.events.projectStarted,
      title: 'Started working on Life Events Log',
      date: '2026-07-01',
      time: '14:30',
      significance: 'turning-point',
      categoryId: ids.categories.projects,
      locationId: ids.locations.rabat,
      notes: 'Started the first working version of the project.',
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      deletedAt: null,
    },
    {
      id: ids.events.coffee,
      title: 'Coffee with Mounir',
      date: '2026-07-01',
      time: null,
      significance: 'ordinary',
      categoryId: ids.categories.personal,
      locationId: ids.locations.rabat,
      notes: '',
      createdAt: '2026-07-01T13:00:00.000Z',
      updatedAt: '2026-07-01T13:00:00.000Z',
      deletedAt: null,
    },
  ],
  eventTags: [
    {
      eventId: ids.events.projectStarted,
      tagId: ids.tags.development,
    },
    {
      eventId: ids.events.projectStarted,
      tagId: ids.tags.localFirst,
    },
  ],
  eventPeople: [
    {
      eventId: ids.events.coffee,
      personId: ids.people.mounir,
    },
  ],
} as const satisfies InMemorySeed;
