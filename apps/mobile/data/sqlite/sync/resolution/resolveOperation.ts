import type { SyncTransaction } from '../../database';
import type { Operation, SyncFieldName } from '../types';
import { resolveEntity } from './resolveEntity';
import { resolveRelation } from './relations';
import { resolveAttachment } from './attachments';
import { resolveAttachmentReorder } from './attachmentReorder';

/** Selects the resolver for an already validated operation. */
export function resolveOperation(
  operation: Operation,
  tx: SyncTransaction
): readonly SyncFieldName[] {
  switch (operation.operationType) {
    case 'event.attachment.reorder':
      return resolveAttachmentReorder(operation, tx);
    case 'attachment.create':
    case 'attachment.delete':
      return resolveAttachment(operation, tx);
    case 'entity.create':
    case 'entity.patch':
    case 'entity.delete':
      return resolveEntity(operation, tx);
    case 'relation.add':
    case 'relation.remove':
      return resolveRelation(operation, tx);
    default:
      throw new Error('Unsupported operation for resolution.');
  }
}
