import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  EntityNotFoundError,
  ModelValidationError,
  RepositoryError,
  comparableMetadataName,
  normalizeSearchText,
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
import type { Category, LELEvent, Location, Person, Tag, UUID } from '@/models';
import type { AppDatabase } from '../database';
import {
  categories,
  categoryModelColumns,
  eventPeople,
  events,
  eventTags,
  locations,
  locationModelColumns,
  people,
  personModelColumns,
  tags,
  tagModelColumns,
} from '../schema';

type NamedEntity = Tag | Person | Location;

export class SQLiteEventImportRepository implements EventImportRepository {
  constructor(
    private readonly database: AppDatabase,
    private readonly dependencies: RepositoryDependencies
  ) {}

  async commit(
    input: CommitEventImportInput
  ): Promise<CommitEventImportResult> {
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
    const referenceIds = collectExistingReferenceIds(eventValues);

    return this.database.transaction((transaction) => {
      const timestamp = this.dependencies.now();
      const existingTags = selectActiveTagsByIds(
        transaction,
        referenceIds.tags
      );
      const existingPeople = selectActivePeopleByIds(
        transaction,
        referenceIds.people
      );
      const existingLocations = selectActiveLocationsByIds(
        transaction,
        referenceIds.locations
      );
      const category = selectActiveCategory(transaction, input.categoryId);
      assertExistingReferences(referenceIds.tags, existingTags, 'Tag');
      assertExistingReferences(referenceIds.people, existingPeople, 'Person');
      assertExistingReferences(
        referenceIds.locations,
        existingLocations,
        'Location'
      );
      if (input.categoryId && !category) {
        throw new EntityNotFoundError('Category', input.categoryId);
      }

      const tagResolution = resolveDefinitions(
        tagDefinitions,
        selectActiveTagsByNames(transaction, tagDefinitions, existingTags),
        (name) => {
          const tag: Tag = {
            id: this.uniqueTagId(transaction),
            name,
            createdAt: timestamp,
            updatedAt: timestamp,
            deletedAt: null,
          };
          transaction
            .insert(tags)
            .values({
              ...tag,
              normalizedName: comparableMetadataName(tag.name),
            })
            .run();
          return tag;
        }
      );
      const personResolution = resolveDefinitions(
        peopleDefinitions,
        selectActivePeopleByNames(
          transaction,
          peopleDefinitions,
          existingPeople
        ),
        (name) => {
          const person: Person = {
            id: this.uniquePersonId(transaction),
            name,
            createdAt: timestamp,
            updatedAt: timestamp,
            deletedAt: null,
          };
          transaction
            .insert(people)
            .values({
              ...person,
              normalizedName: comparableMetadataName(person.name),
            })
            .run();
          return person;
        }
      );
      const locationResolution = resolveDefinitions(
        locationDefinitions,
        selectActiveLocationsByNames(
          transaction,
          locationDefinitions,
          existingLocations
        ),
        (name) => {
          const location: Location = {
            id: this.uniqueLocationId(transaction),
            name,
            createdAt: timestamp,
            updatedAt: timestamp,
            deletedAt: null,
          };
          transaction
            .insert(locations)
            .values({
              ...location,
              normalizedName: comparableMetadataName(location.name),
            })
            .run();
          return location;
        }
      );
      for (const values of eventValues) {
        const tagEntities = resolveReferences(
          values.tags,
          existingTags,
          tagResolution.byTemporaryId,
          'Tag'
        );
        const peopleEntities = resolveReferences(
          values.people,
          existingPeople,
          personResolution.byTemporaryId,
          'Person'
        );
        const location = values.location
          ? resolveReference(
              values.location,
              existingLocations,
              locationResolution.byTemporaryId,
              'Location'
            )
          : null;
        const event: LELEvent = {
          id: this.uniqueEventId(transaction),
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
        transaction
          .insert(events)
          .values({
            ...event,
            normalizedTitle: normalizeSearchText(event.title),
          })
          .run();
        if (tagEntities.length > 0) {
          transaction
            .insert(eventTags)
            .values(
              tagEntities.map((tag) => ({
                eventId: event.id,
                tagId: tag.id,
                createdAt: timestamp,
                updatedAt: timestamp,
                deletedAt: null,
              }))
            )
            .run();
        }
        if (peopleEntities.length > 0) {
          transaction
            .insert(eventPeople)
            .values(
              peopleEntities.map((person) => ({
                eventId: event.id,
                personId: person.id,
                createdAt: timestamp,
                updatedAt: timestamp,
                deletedAt: null,
              }))
            )
            .run();
        }
      }

      return {
        eventCount: eventValues.length,
        createdMetadata: {
          tagCount: tagResolution.created.length,
          peopleCount: personResolution.created.length,
          locationCount: locationResolution.created.length,
        },
      };
    });
  }

  private uniqueTagId(database: Pick<AppDatabase, 'select'>) {
    return this.uniqueId(database, tags, 'tag');
  }

  private uniquePersonId(database: Pick<AppDatabase, 'select'>) {
    return this.uniqueId(database, people, 'person');
  }

  private uniqueLocationId(database: Pick<AppDatabase, 'select'>) {
    return this.uniqueId(database, locations, 'location');
  }

  private uniqueEventId(database: Pick<AppDatabase, 'select'>) {
    return this.uniqueId(database, events, 'event');
  }

  private uniqueId(
    database: Pick<AppDatabase, 'select'>,
    table: typeof tags | typeof people | typeof locations | typeof events,
    entityName: string
  ) {
    const id = this.dependencies.createId();
    const existing = database
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, id))
      .get();
    if (existing) {
      throw new RepositoryError(
        `Generated duplicate ${entityName} ID “${id}”. Nothing was imported.`
      );
    }
    return id;
  }
}

function collectExistingReferenceIds(
  eventsToImport: readonly CommitEventImportInput['events'][number][]
) {
  const tags = new Set<UUID>();
  const people = new Set<UUID>();
  const locations = new Set<UUID>();
  for (const event of eventsToImport) {
    for (const reference of event.tags) {
      if (reference.kind === 'existing') tags.add(reference.id);
    }
    for (const reference of event.people) {
      if (reference.kind === 'existing') people.add(reference.id);
    }
    if (event.location?.kind === 'existing') {
      locations.add(event.location.id);
    }
  }
  return {
    tags: [...tags],
    people: [...people],
    locations: [...locations],
  };
}

function assertExistingReferences<TEntity extends { id: UUID }>(
  ids: readonly UUID[],
  entities: ReadonlyMap<UUID, TEntity>,
  entityName: string
) {
  for (const id of ids) {
    if (!entities.has(id)) throw new EntityNotFoundError(entityName, id);
  }
}

function resolveDefinitions<TEntity extends NamedEntity>(
  definitions: readonly NewEventImportMetadata[],
  existingByName: ReadonlyMap<string, TEntity>,
  create: (name: string) => TEntity
) {
  const byName = new Map(existingByName);
  const byTemporaryId = new Map<string, TEntity>();
  const created: TEntity[] = [];
  for (const definition of definitions) {
    const comparison = comparableMetadataName(definition.name);
    let entity = byName.get(comparison);
    if (!entity) {
      entity = create(definition.name);
      byName.set(comparison, entity);
      created.push(entity);
    }
    byTemporaryId.set(definition.temporaryId, entity);
  }
  return { byTemporaryId, created };
}

function resolveReferences<TEntity extends NamedEntity>(
  references: readonly EventImportMetadataReference[],
  existing: ReadonlyMap<UUID, TEntity>,
  created: ReadonlyMap<string, TEntity>,
  entityName: 'Tag' | 'Person'
): TEntity[] {
  const resolved = new Map<UUID, TEntity>();
  for (const reference of references) {
    const entity = resolveReference(reference, existing, created, entityName);
    resolved.set(entity.id, entity);
  }
  return [...resolved.values()];
}

function resolveReference<TEntity extends NamedEntity>(
  reference: EventImportMetadataReference,
  existing: ReadonlyMap<UUID, TEntity>,
  created: ReadonlyMap<string, TEntity>,
  entityName: 'Tag' | 'Person' | 'Location'
): TEntity {
  if (reference.kind === 'existing') {
    const entity = existing.get(reference.id);
    if (!entity) throw new EntityNotFoundError(entityName, reference.id);
    return entity;
  }
  const entity = created.get(reference.temporaryId);
  if (!entity) {
    throw new ModelValidationError(
      `${entityName} temporary reference “${reference.temporaryId}” has no definition.`
    );
  }
  return entity;
}

type ReadDatabase = Pick<AppDatabase, 'select'>;

function selectActiveTagsByIds(database: ReadDatabase, ids: readonly UUID[]) {
  if (ids.length === 0) return new Map<UUID, Tag>();
  return new Map(
    database
      .select(tagModelColumns)
      .from(tags)
      .where(and(isNull(tags.deletedAt), inArray(tags.id, ids)))
      .all()
      .map((tag) => [tag.id, tag])
  );
}

function selectActivePeopleByIds(database: ReadDatabase, ids: readonly UUID[]) {
  if (ids.length === 0) return new Map<UUID, Person>();
  return new Map(
    database
      .select(personModelColumns)
      .from(people)
      .where(and(isNull(people.deletedAt), inArray(people.id, ids)))
      .all()
      .map((person) => [person.id, person])
  );
}

function selectActiveLocationsByIds(
  database: ReadDatabase,
  ids: readonly UUID[]
) {
  if (ids.length === 0) return new Map<UUID, Location>();
  return new Map(
    database
      .select(locationModelColumns)
      .from(locations)
      .where(and(isNull(locations.deletedAt), inArray(locations.id, ids)))
      .all()
      .map((location) => [location.id, location])
  );
}

function selectActiveCategory(
  database: ReadDatabase,
  id: UUID | null
): Category | null {
  if (!id) return null;
  return (
    database
      .select(categoryModelColumns)
      .from(categories)
      .where(and(isNull(categories.deletedAt), eq(categories.id, id)))
      .get() ?? null
  );
}

function selectActiveTagsByNames(
  database: ReadDatabase,
  definitions: readonly NewEventImportMetadata[],
  knownEntities: ReadonlyMap<UUID, Tag>
) {
  const byName = entitiesByName(knownEntities.values());
  const names = unresolvedComparableNames(definitions, byName);
  if (names.length > 0) {
    for (const tag of database
      .select(tagModelColumns)
      .from(tags)
      .where(and(isNull(tags.deletedAt), inArray(tags.normalizedName, names)))
      .all()) {
      byName.set(comparableMetadataName(tag.name), tag);
    }
  }
  return byName;
}

function selectActivePeopleByNames(
  database: ReadDatabase,
  definitions: readonly NewEventImportMetadata[],
  knownEntities: ReadonlyMap<UUID, Person>
) {
  const byName = entitiesByName(knownEntities.values());
  const names = unresolvedComparableNames(definitions, byName);
  if (names.length > 0) {
    for (const person of database
      .select(personModelColumns)
      .from(people)
      .where(
        and(isNull(people.deletedAt), inArray(people.normalizedName, names))
      )
      .all()) {
      byName.set(comparableMetadataName(person.name), person);
    }
  }
  return byName;
}

function selectActiveLocationsByNames(
  database: ReadDatabase,
  definitions: readonly NewEventImportMetadata[],
  knownEntities: ReadonlyMap<UUID, Location>
) {
  const byName = entitiesByName(knownEntities.values());
  const names = unresolvedComparableNames(definitions, byName);
  if (names.length > 0) {
    for (const location of database
      .select(locationModelColumns)
      .from(locations)
      .where(
        and(
          isNull(locations.deletedAt),
          inArray(locations.normalizedName, names)
        )
      )
      .all()) {
      byName.set(comparableMetadataName(location.name), location);
    }
  }
  return byName;
}

function entitiesByName<TEntity extends NamedEntity>(
  entities: Iterable<TEntity>
) {
  const byName = new Map<string, TEntity>();
  for (const entity of entities) {
    byName.set(comparableMetadataName(entity.name), entity);
  }
  return byName;
}

function unresolvedComparableNames<TEntity extends NamedEntity>(
  definitions: readonly NewEventImportMetadata[],
  knownByName: ReadonlyMap<string, TEntity>
) {
  const names = new Set<string>();
  for (const definition of definitions) {
    const name = comparableMetadataName(definition.name);
    if (!knownByName.has(name)) names.add(name);
  }
  return [...names];
}
