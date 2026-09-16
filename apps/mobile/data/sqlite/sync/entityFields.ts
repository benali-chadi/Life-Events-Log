import type {
  DomainFieldNamesByEntity,
  Operation,
  SyncFieldName,
} from './types';

export const entityFields = {
  event: {
    title: 'title',
    date: 'date',
    time: 'time',
    significance: 'significance',
    categoryId: 'category_id',
    locationId: 'location_id',
    notes: 'notes',
  },
  category: { name: 'name', color: 'color' },
  tag: { name: 'name' },
  person: { name: 'name' },
  location: { name: 'name' },
} as const satisfies {
  [E in 'event' | 'category' | 'tag' | 'person' | 'location']: Record<
    string,
    DomainFieldNamesByEntity[E]
  >;
};

/** Fields affected by the payload; resolveOperation selects the winning subset.
 * Also used by bootstrap when adopting mutations already present in domain rows.
 */
export function winningFieldsFor(
  operation: Operation
): readonly SyncFieldName[] {
  switch (operation.operationType) {
    case 'entity.create':
      return [
        ...Object.values(entityFields[operation.entityType]),
        'deleted_at',
      ];
    case 'entity.patch': {
      const mapping: Readonly<Record<string, SyncFieldName>> =
        entityFields[operation.entityType];
      return Object.keys(operation.payload.changes).map((key) => mapping[key]!);
    }
    case 'entity.delete':
      return ['deleted_at'];
    default:
      throw new Error(
        `Winning fields not implemented: ${operation.operationType}/${operation.entityType}.`
      );
  }
}
