import type {
  Category,
  EventAttachment,
  EventPerson,
  EventTag,
  LELEvent,
  Location,
  Person,
  Tag,
  UUID,
} from '@/models';

export type InMemoryDatabase = {
  events: Map<UUID, LELEvent>;
  attachments: Map<UUID, EventAttachment>;
  tags: Map<UUID, Tag>;
  categories: Map<UUID, Category>;
  people: Map<UUID, Person>;
  locations: Map<UUID, Location>;
  eventTags: Map<string, EventTag>;
  eventPeople: Map<string, EventPerson>;
};

export type InMemorySeed = {
  events?: readonly LELEvent[];
  attachments?: readonly EventAttachment[];
  tags?: readonly Tag[];
  categories?: readonly Category[];
  people?: readonly Person[];
  locations?: readonly Location[];
  eventTags?: readonly EventTag[];
  eventPeople?: readonly EventPerson[];
};
