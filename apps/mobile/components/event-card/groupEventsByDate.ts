import type { LocalDate } from '@/models';
import type { EventListItem } from '@/data/repositories';

function localDateToday(): LocalDate {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}` as LocalDate;
}

function shiftLocalDate(date: LocalDate, days: number): LocalDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const shifted = new Date(year, month - 1, day + days);
  const shiftedMonth = String(shifted.getMonth() + 1).padStart(2, '0');
  const shiftedDay = String(shifted.getDate()).padStart(2, '0');

  return `${shifted.getFullYear()}-${shiftedMonth}-${shiftedDay}` as LocalDate;
}

function formatSectionDate(date: LocalDate) {
  const today = localDateToday();

  if (date === today) return 'Today';
  if (date === shiftLocalDate(today, -1)) return 'Yesterday';

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: year === new Date().getFullYear() ? undefined : 'numeric',
  }).format(new Date(year, month - 1, day, 12));
}

export function groupEventsByDate(items: EventListItem[]) {
  const groups = new Map<LocalDate, EventListItem[]>();

  for (const item of items) {
    const existing = groups.get(item.event.date);

    if (existing) existing.push(item);
    else groups.set(item.event.date, [item]);
  }

  const dates = Array.from(groups.keys());
  return Array.from(groups, ([date, data], index) => ({
    key: date,
    monthTitle:
      index === 0 || dates[index - 1]?.slice(0, 7) !== date.slice(0, 7)
        ? new Intl.DateTimeFormat(undefined, {
            month: 'long',
            year: 'numeric',
          }).format(
            new Date(
              Number(date.slice(0, 4)),
              Number(date.slice(5, 7)) - 1,
              1,
              12
            )
          )
        : undefined,
    date,
    title: formatSectionDate(date),
    data,
  }));
}
