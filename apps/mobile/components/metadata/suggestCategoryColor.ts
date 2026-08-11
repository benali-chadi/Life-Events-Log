import {
  CATEGORY_COLOR_VALUES,
  type Category,
  type CategoryColor,
} from '@/models';

export function suggestCategoryColor(
  categories: readonly Category[]
): CategoryColor {
  const counts = new Map<CategoryColor, number>(
    CATEGORY_COLOR_VALUES.map((color) => [color, 0])
  );

  for (const category of categories) {
    counts.set(category.color, (counts.get(category.color) ?? 0) + 1);
  }

  return CATEGORY_COLOR_VALUES.reduce((suggested, color) =>
    (counts.get(color) ?? 0) < (counts.get(suggested) ?? 0) ? color : suggested
  );
}
