import type {
  CategoryColor,
  EventSignificance,
  LocalDate,
  LocalTime,
  Timestamp,
  UUID,
} from '@/models';

export type EventCardData = {
  id?: UUID;
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
