import type { eventColors } from '@lel/design';

export type EventSignificance =
  'ordinary' | 'notable' | 'major' | 'turning-point';

export type LELEvent = {
  title: string;
  date: string;
  time?: string;
  createdAt: string;
  categoryColor?: keyof typeof eventColors;
  categoryName?: string;
  tags?: string[];
  location?: string;
  people?: string[];
  significance?: EventSignificance;
  notes?: string;
};
