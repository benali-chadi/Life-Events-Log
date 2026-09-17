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
    case 'event.attachment.reorder':
      return ['attachment_order'];
    case 'attachment.create':
      return [
        'event_id',
        'content_hash',
        'filename',
        'mime_type',
        'width',
        'height',
        'file_size',
        'deleted_at',
      ];
    case 'attachment.delete':
      return ['deleted_at'];
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
    case 'relation.add':
    case 'relation.remove':
      return ['deleted_at'];
    default:
      throw new Error('Unsupported operation fields.');
  }
}
