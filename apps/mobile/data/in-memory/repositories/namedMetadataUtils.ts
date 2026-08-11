export function normalizeMetadataName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

export function comparableMetadataName(name: string) {
  return normalizeMetadataName(name).toLowerCase();
}

export function compareMetadataNames(
  first: { id: string; name: string },
  second: { id: string; name: string }
) {
  return (
    first.name.localeCompare(second.name, undefined, {
      sensitivity: 'base',
    }) || first.id.localeCompare(second.id)
  );
}

export function cloneMetadataEntity<TEntity>(entity: TEntity): TEntity {
  return { ...entity };
}
