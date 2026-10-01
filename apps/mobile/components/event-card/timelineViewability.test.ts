import { expect, it } from 'vitest';
import type { ViewToken } from 'react-native';
import {
  firstVisibleTimelineEventId,
  timelineItemKey,
  pinnedTimelineTitle,
} from './timelineViewability';
const event = (id: string, index: number, isViewable = true): ViewToken => ({
  key: id,
  index,
  isViewable,
  item: { event: { id } },
});
it('ignores sticky/section header and footer tokens and uses the first visible event', () => {
  expect(
    firstVisibleTimelineEventId([
      {
        key: 'header',
        index: null,
        isViewable: true,
        item: { title: 'Today' },
      },
      event('previous-offscreen', 0, false),
      event('top-event', 1),
      event('next-event', 0),
    ])
  ).toBe('top-event');
});
it('supports a single tall visible event', () => {
  expect(firstVisibleTimelineEventId([event('long-note', 0)])).toBe(
    'long-note'
  );
});
it('leaves the current date untouched during empty/header-only visibility reports', () => {
  expect(firstVisibleTimelineEventId([])).toBeNull();
  expect(
    firstVisibleTimelineEventId([
      { key: 'footer', index: null, isViewable: true, item: {} },
    ])
  ).toBeNull();
});

it('extracts keys for section tokens as well as events', () => {
  expect(timelineItemKey({ key: '2026-10-01' })).toBe('2026-10-01');
  expect(timelineItemKey(event('event-1', 0).item)).toBe('event-1');
});

it('selects the earliest current event even when tokens are unordered or stale', () => {
  const order = new Map([
    ['october', 0],
    ['september25', 1],
    ['september19', 2],
  ]);
  expect(
    firstVisibleTimelineEventId(
      [
        event('september19', 0),
        event('removed', 0),
        event('october', 0),
        event('september25', 0),
      ],
      order
    )
  ).toBe('october');
  expect(firstVisibleTimelineEventId([event('removed', 0)], order)).toBeNull();
});
it('uses the first date at the top regardless of the previous visibility report', () => {
  const titles = new Map([
    ['october', 'October 1'],
    ['september25', 'September 25'],
    ['september19', 'September 19'],
  ]);
  expect(pinnedTimelineTitle(titles, 'september19', true)).toBe('October 1');
  expect(pinnedTimelineTitle(titles, 'september25', false)).toBe(
    'September 25'
  );
  expect(pinnedTimelineTitle(titles, 'deleted', false)).toBe('October 1');
  expect(pinnedTimelineTitle(new Map(), 'october', true)).toBeUndefined();
});
