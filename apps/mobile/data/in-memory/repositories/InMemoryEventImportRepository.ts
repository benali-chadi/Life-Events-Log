import {
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  comparableMetadataName,
  normalizeMetadataName,
  type CommitEventImportInput,
  type CommitEventImportResult,
  type EventImportMetadataReference,
  type EventImportRepository,
  type NewEventImportMetadata,
  type RepositoryDependencies,
} from '@/data/repositories';
import {
  validateEventImportValues,
  validateNewMetadataDefinitions,
} from '@/data/repositories/eventImportValidation';
import type {
  LELEvent,
  Location,
  Person,
  Tag,
  Timestamp,
  UUID,
} from '@/models';
import { eventPersonKey, eventTagKey } from '../relationshipKeys';
import type { InMemoryDatabase } from '../types';

type NamedEntity = Tag | Person | Location;

export class InMemoryEventImportRepository implements EventImportRepository {
  constructor(
    private readonly database: InMemoryDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async commit(
    input: CommitEventImportInput
  ): Promise<CommitEventImportResult> {
    const staged = cloneDatabase(this.database);
    const timestamp = this.dependencies.now();
    const eventValues = input.events.map(validateEventImportValues);
    const tagDefinitions = validateNewMetadataDefinitions(
      'Tag',
      input.newMetadata.tags
    );
    const peopleDefinitions = validateNewMetadataDefinitions(
      'Person',
      input.newMetadata.people
    );
    const locationDefinitions = validateNewMetadataDefinitions(
      'Location',
      input.newMetadata.locations
    );
    const category = activeEntity(staged.categories, input.categoryId);
    if (input.categoryId && !category) {
      throw new EntityNotFoundError('Category', input.categoryId);
    }
    const createdTags: Tag[] = [];
    const createdPeople: Person[] = [];
    const createdLocations: Location[] = [];
    const tagIds = this.resolveDefinitions(
      staged.tags,
      tagDefinitions,
      'Tag',
      timestamp,
      createdTags
    );
    const personIds = this.resolveDefinitions(
      staged.people,
      peopleDefinitions,
      'Person',
      timestamp,
      createdPeople
    );
    const locationIds = this.resolveDefinitions(
      staged.locations,
      locationDefinitions,
      'Location',
      timestamp,
      createdLocations
    );

    for (const values of eventValues) {
      const tagEntities = this.resolveReferences(
        values.tags,
        staged.tags,
        tagIds,
        'Tag'
      );
      const peopleEntities = this.resolveReferences(
        values.people,
        staged.people,
        personIds,
        'Person'
      );
      const location = values.location
        ? this.resolveReference(
            values.location,
            staged.locations,
            locationIds,
            'Location'
          )
        : null;
      const id = this.uniqueId(staged.events, 'event');
      const event: LELEvent = {
        id,
        title: values.title,
        date: values.date,
        time: values.time,
        significance: values.significance,
        categoryId: category?.id ?? null,
        locationId: location?.id ?? null,
        notes: values.notes,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      };
      staged.events.set(id, event);
      for (const tag of tagEntities) {
        staged.eventTags.set(eventTagKey(id, tag.id), {
          eventId: id,
          tagId: tag.id,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
        });
      }
      for (const person of peopleEntities) {
        staged.eventPeople.set(eventPersonKey(id, person.id), {
          eventId: id,
          personId: person.id,
          createdAt: timestamp,
          updatedAt: timestamp,
          deletedAt: null,
        });
      }
    }

    replaceDatabase(this.database, staged);
    return {
      eventCount: eventValues.length,
      createdMetadata: {
        tagCount: createdTags.length,
        peopleCount: createdPeople.length,
        locationCount: createdLocations.length,
      },
    };
  }

  private resolveDefinitions<TEntity extends NamedEntity>(
    table: Map<UUID, TEntity>,
    definitions: readonly NewEventImportMetadata[],
    entityName: 'Tag' | 'Person' | 'Location',
    timestamp: Timestamp,
    created: TEntity[]
  ): Map<string, UUID> {
    const ids = new Map<string, UUID>();
    for (const definition of definitions) {
      const comparison = comparableMetadataName(definition.name);
      const existing = [...table.values()].find(
        (entity) =>
          entity.deletedAt === null &&
          comparableMetadataName(entity.name) === comparison
      );
      if (existing) {
        ids.set(definition.temporaryId, existing.id);
        continue;
      }
      const id = this.uniqueId(table, entityName.toLowerCase());
      const entity = {
        id,
        name: normalizeMetadataName(definition.name),
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      } as TEntity;
      table.set(id, entity);
      created.push(entity);
      ids.set(definition.temporaryId, id);
    }
    return ids;
  }

  private resolveReferences<TEntity extends NamedEntity>(
    references: readonly EventImportMetadataReference[],
    table: ReadonlyMap<UUID, TEntity>,
    temporaryIds: ReadonlyMap<string, UUID>,
    entityName: 'Tag' | 'Person'
  ): TEntity[] {
    const resolved = new Map<UUID, TEntity>();
    for (const reference of references) {
      const entity = this.resolveReference(
        reference,
        table,
        temporaryIds,
        entityName
      );
      resolved.set(entity.id, entity);
    }
    return [...resolved.values()];
  }

  private resolveReference<TEntity extends NamedEntity>(
    reference: EventImportMetadataReference,
    table: ReadonlyMap<UUID, TEntity>,
    temporaryIds: ReadonlyMap<string, UUID>,
    entityName: 'Tag' | 'Person' | 'Location'
  ): TEntity {
    const id =
      reference.kind === 'existing'
        ? reference.id
        : temporaryIds.get(reference.temporaryId);
    if (!id) {
      throw new ModelValidationError(
        `${entityName} temporary reference “${reference.kind === 'new' ? reference.temporaryId : ''}” has no definition.`
      );
    }
    const entity = activeEntity(table, id);
    if (!entity) throw new EntityNotFoundError(entityName, id);
    return entity;
  }

  private uniqueId<TEntity>(table: ReadonlyMap<UUID, TEntity>, name: string) {
    const id = this.dependencies.createId();
    if (table.has(id)) {
      throw new RepositoryError(
        `Generated duplicate ${name} ID “${id}”. Nothing was imported.`
      );
    }
    return id;
  }
}

function activeEntity<TEntity extends { deletedAt: Timestamp | null }>(
  table: ReadonlyMap<UUID, TEntity>,
  id: UUID | null
): TEntity | null {
  if (!id) return null;
  const entity = table.get(id);
  return entity?.deletedAt === null ? entity : null;
}

function cloneDatabase(database: InMemoryDatabase): InMemoryDatabase {
  return {
    events: cloneMap(database.events),
    attachments: cloneMap(database.attachments),
    tags: cloneMap(database.tags),
    categories: cloneMap(database.categories),
    people: cloneMap(database.people),
    locations: cloneMap(database.locations),
    eventTags: cloneMap(database.eventTags),
    eventPeople: cloneMap(database.eventPeople),
  };
}

function cloneMap<TKey, TValue>(source: ReadonlyMap<TKey, TValue>) {
  return new Map([...source].map(([key, value]) => [key, { ...value }]));
}

function replaceDatabase(target: InMemoryDatabase, source: InMemoryDatabase) {
  for (const key of Object.keys(target) as (keyof InMemoryDatabase)[]) {
    const targetMap = target[key] as Map<unknown, unknown>;
    const sourceMap = source[key] as Map<unknown, unknown>;
    targetMap.clear();
    sourceMap.forEach((value, id) => targetMap.set(id, value));
  }
}
