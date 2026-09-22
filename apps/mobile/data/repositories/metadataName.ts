export function normalizeMetadataName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

export function comparableMetadataName(name: string) {
  return normalizeSearchText(name);
}

export function normalizeSearchText(value: string) {
  return normalizeMetadataName(value).toLowerCase();
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

/** In-memory counterpart of SQLite's correlated display-name projection. */
export function metadataWithDisplayName<
  T extends { id: string; name: string; deletedAt: string | null },
>(entity: T, peers: Iterable<T>): T & { displayName: string } {
  const collisions =
    entity.deletedAt === null
      ? [...peers].filter(
          (peer) =>
            peer.id !== entity.id &&
            peer.deletedAt === null &&
            comparableMetadataName(peer.name) ===
              comparableMetadataName(entity.name)
        )
      : [];
  const prefix = entity.id.slice(0, 8);
  const suffix = collisions.some((peer) => peer.id.slice(0, 8) === prefix)
    ? entity.id
    : prefix;
  return {
    ...entity,
    displayName: collisions.length ? `${entity.name} · ${suffix}` : entity.name,
  };
}
