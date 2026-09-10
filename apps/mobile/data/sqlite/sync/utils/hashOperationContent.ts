import canonicalize from 'canonicalize';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { OperationContent } from '../types';

/** RFC 8785 JSON, encoded as UTF-8 and hashed with SHA-256. */
export function hashOperationContent(operation: OperationContent): string {
  const content: OperationContent = {
    originDeviceId: operation.originDeviceId,
    originSequence: operation.originSequence,
    lamport: operation.lamport,
    causalContext: operation.causalContext,
    operationType: operation.operationType,
    entityType: operation.entityType,
    entityId: operation.entityId,
    payload: operation.payload,
  };

  assertJson(content);
  const serialized = canonicalize(content);
  if (serialized === undefined) {
    throw new Error('Operation content could not be serialized.');
  }
  return `sha256:${bytesToHex(sha256(utf8ToBytes(serialized)))}`;
}

// Reject values JSON serializers might silently omit or transform. This is
// serialization validation; operation-specific domain validation is separate.
function assertJson(value: unknown, ancestors = new Set<object>()): void {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) {
          throw new Error('Operation contains an invalid Unicode string.');
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        throw new Error('Operation contains an invalid Unicode string.');
      }
    }
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') {
    throw new Error('Operation contains a non-JSON value.');
  }
  if (ancestors.has(value)) throw new Error('Operation contains a cycle.');
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!array && prototype !== Object.prototype && prototype !== null) {
    throw new Error('Operation contains a non-JSON object.');
  }
  ancestors.add(value);
  try {
    if (array) {
      for (let i = 0; i < value.length; i++) {
        if (!Object.hasOwn(value, i))
          throw new Error('Operation contains a sparse array.');
      }
    }
    for (const key of Reflect.ownKeys(value)) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (
        typeof key !== 'string' ||
        !descriptor.enumerable ||
        !('value' in descriptor)
      ) {
        throw new Error('Operation contains a non-JSON property.');
      }
      if (
        array &&
        (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)
      ) {
        throw new Error('Operation array contains an extra property.');
      }
      assertJson(key, ancestors);
      assertJson(descriptor.value, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}
