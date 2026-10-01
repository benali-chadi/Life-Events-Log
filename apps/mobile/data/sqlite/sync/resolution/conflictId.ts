import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { SyncEntityType, DomainFieldName } from '../types';

/** Same entity/field always gets the same local conflict ID.
 * Hash the composite key, keep 128 bits, then format as a custom/version-8 UUID.
 * This is bookkeeping identity, not a signature or a merge decision.
 */
export function conflictId(
  entityType: SyncEntityType,
  entityId: string,
  field: DomainFieldName
): string {
  const bytes = sha256(
    utf8ToBytes(JSON.stringify(['LEL-conflict', entityType, entityId, field]))
  ).slice(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80; // Set version bits to 1000 (8).
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // Set UUID variant bits to 10.
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
