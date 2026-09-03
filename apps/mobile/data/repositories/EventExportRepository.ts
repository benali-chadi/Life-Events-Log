import type { Category, LELEvent, Location, Person, Tag, UUID } from '@/models';
import type { EventListQuery } from './EventRepository';

export type EventExportItem = {
  event: LELEvent;
  category: Category | null;
  location: Location | null;
  tags: Tag[];
  people: Person[];
};

export type EventExportQuery = Omit<EventListQuery, 'limit' | 'cursor'>;

export interface EventExportRepository {
  getByIds(ids: readonly UUID[]): Promise<EventExportItem[]>;
  list(query: EventExportQuery): Promise<EventExportItem[]>;
}
