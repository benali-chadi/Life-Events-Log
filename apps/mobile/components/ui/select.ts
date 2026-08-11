export type SelectOption = {
  id: string;
  label: string;
};

export function normalizeOptionValue(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

type FilterOptionsParams = {
  options: SelectOption[];
  query: string;
  excludedIds?: ReadonlySet<string>;
  limit?: number;
};

export function filterOptions({
  options,
  query,
  excludedIds,
  limit = 6,
}: FilterOptionsParams) {
  const normalizedQuery = normalizeOptionValue(query);
  const availableOptions = excludedIds
    ? options.filter((option) => !excludedIds.has(option.id))
    : options;

  if (!normalizedQuery) return availableOptions.slice(0, limit);

  return availableOptions
    .filter((option) =>
      normalizeOptionValue(option.label).includes(normalizedQuery)
    )
    .sort((first, second) => {
      const firstLabel = normalizeOptionValue(first.label);
      const secondLabel = normalizeOptionValue(second.label);
      const firstStartsWith = firstLabel.startsWith(normalizedQuery);
      const secondStartsWith = secondLabel.startsWith(normalizedQuery);

      if (firstStartsWith !== secondStartsWith) return firstStartsWith ? -1 : 1;

      return first.label.localeCompare(second.label);
    })
    .slice(0, limit);
}
