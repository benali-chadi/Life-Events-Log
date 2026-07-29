import type {
  CategoryColor,
  EventSignificance,
  LocalDate,
  LocalTime,
  Timestamp,
} from '@/models';

export type EventCardData = {
  title: string;
  date: LocalDate;
  time?: LocalTime;
  createdAt: Timestamp;
  categoryColor?: CategoryColor;
  categoryName?: string;
  tags?: string[];
  location?: string;
  people?: string[];
  significance?: EventSignificance;
  notes?: string;
};
