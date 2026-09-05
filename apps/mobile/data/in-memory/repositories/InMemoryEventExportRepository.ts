import type {
  EventExportQuery,
  EventExportRepository,
  EventRepository,
} from '@/data/repositories';
import type { UUID, EventDetails } from '@/models';

const EXPORT_PAGE_SIZE = 500;

export class InMemoryEventExportRepository implements EventExportRepository {
  constructor(private readonly events: EventRepository) {}

  async getByIds(ids: readonly UUID[]) {
    const uniqueIds = [...new Set(ids)];
    const result = [];
    for (const id of uniqueIds) {
      const details = await this.events.getDetailsById(id);
      if (details) result.push(withoutAttachments(details));
    }
    return result;
  }

  async list(query: EventExportQuery) {
    const result = [];
    let cursor: string | undefined;
    do {
      const page = await this.events.list({
        ...query,
        limit: EXPORT_PAGE_SIZE,
        cursor,
      });
      const details = await this.getByIds(
        page.items.map(({ event }) => event.id)
      );
      result.push(...details);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return result;
  }
}

function withoutAttachments({
  attachments: _attachments,
  ...item
}: EventDetails) {
  return item;
}
