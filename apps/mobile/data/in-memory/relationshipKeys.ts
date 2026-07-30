import type { UUID } from '@/models';

function relationshipKey(firstId: UUID, secondId: UUID) {
  return JSON.stringify([firstId, secondId]);
}

export function eventTagKey(eventId: UUID, tagId: UUID) {
  return relationshipKey(eventId, tagId);
}

export function eventPersonKey(eventId: UUID, personId: UUID) {
  return relationshipKey(eventId, personId);
}
