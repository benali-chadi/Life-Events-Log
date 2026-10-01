import type { ViewToken } from 'react-native';
import type { EventListItem } from '@/data/repositories';

// Section-local indices restart for each date; use the current list's ID order.
export function firstVisibleTimelineEventId(
  items: ViewToken[],
  eventOrder?: ReadonlyMap<string, number>
): string | null {
  let first: string | null = null;
  let firstRank = Infinity;
  for (const token of items) {
    if (!token.isViewable || token.index == null) continue;
    const item = token.item as EventListItem | undefined;
    const id = item?.event?.id;
    if (typeof id !== 'string') continue;
    if (!eventOrder) return id;
    const rank = eventOrder.get(id);
    if (rank !== undefined && rank < firstRank) {
      first = id;
      firstRank = rank;
    }
  }
  return first;
}

export function pinnedTimelineTitle(
  titles: ReadonlyMap<string, string>,
  visibleEventId: string | null,
  atStart: boolean
): string | undefined {
  const first = titles.values().next().value;
  return atStart
    ? first
    : ((visibleEventId ? titles.get(visibleEventId) : undefined) ?? first);
}

// RN 0.81 also calls the supplied extractor for section-header visibility tokens.
export function timelineItemKey(item: EventListItem | { key: string }): string {
  return 'event' in item ? item.event.id : item.key;
}
