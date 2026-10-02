import { describe, expect, it } from 'vitest';
import { groupEventsByDate } from './groupEventsByDate';
import type { EventListItem } from '@/data/repositories';

const item = (id: string, date: string) =>
  ({ event: { id, date } }) as EventListItem;

describe('timeline day sections', () => {
  it('keeps section identity when earlier days are inserted or filtered out', () => {
    const old = item('older', '2025-12-31');
    const recent = item('recent', '2026-01-01');
    expect(groupEventsByDate([old])[0]?.key).toBe('2025-12-31');
    expect(groupEventsByDate([recent, old])[1]?.key).toBe('2025-12-31');
  });

  it('combines a day across page boundaries without reordering its events', () => {
    const sections = groupEventsByDate([
      item('evening', '2026-09-28'),
      item('morning', '2026-09-28'),
      item('previous', '2026-09-27'),
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0]?.data.map((entry) => entry.event.id)).toEqual([
      'evening',
      'morning',
    ]);
    expect(sections[0]?.monthTitle).toBeTruthy();
    expect(sections[1]?.monthTitle).toBeUndefined();
  });

  it('shows month and year context at year boundaries and after filtering', () => {
    const entries = [item('new', '2026-01-01'), item('old', '2025-12-31')];
    expect(
      groupEventsByDate(entries).map((section) => section.monthTitle)
    ).toEqual([
      expect.stringContaining('2026'),
      expect.stringContaining('2025'),
    ]);
    expect(groupEventsByDate(entries.slice(1))[0]?.monthTitle).toContain(
      '2025'
    );
  });

  it('has no headers for an empty result', () => {
    expect(groupEventsByDate([])).toEqual([]);
  });
});
