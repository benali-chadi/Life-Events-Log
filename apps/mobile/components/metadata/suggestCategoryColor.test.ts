import type { Category, CategoryColor } from '@/models';
import { describe, expect, it } from 'vitest';
import { suggestCategoryColor } from './suggestCategoryColor';

function category(id: string, color: CategoryColor): Category {
  return {
    id,
    name: id,
    color,
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-08-10T10:00:00.000Z',
    deletedAt: null,
  };
}

describe('suggestCategoryColor', () => {
  it('chooses the first unused color in palette order', () => {
    expect(
      suggestCategoryColor([
        category('one', 'blue'),
        category('two', 'green'),
        category('three', 'rose'),
      ])
    ).toBe('amber');
  });

  it('chooses the least-assigned color when every color is represented', () => {
    const categories: Category[] = [
      category('blue-one', 'blue'),
      category('blue-two', 'blue'),
      category('green-one', 'green'),
      category('green-two', 'green'),
      category('rose-one', 'rose'),
      category('rose-two', 'rose'),
      category('amber', 'amber'),
      category('violet', 'violet'),
      category('teal', 'teal'),
      category('cyan', 'cyan'),
      category('coral', 'coral'),
      category('olive', 'olive'),
      category('brown', 'brown'),
      category('slate', 'slate'),
      category('navy', 'navy'),
      category('magenta', 'magenta'),
    ];

    expect(suggestCategoryColor(categories)).toBe('amber');
  });
});
