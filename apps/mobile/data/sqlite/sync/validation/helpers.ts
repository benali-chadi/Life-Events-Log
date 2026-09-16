import { OperationValidationError } from './OperationValidationError';

export function validationError(path: string, message: string): never {
  throw new OperationValidationError(`${path}: ${message}`);
}

/** A plain data object, without accessors or non-JSON own properties. */
export function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    validationError(path, 'must be a plain object');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    validationError(path, 'must be a plain object');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      typeof key !== 'string' ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    )
      validationError(path, 'must contain JSON properties only');
  }
  return value as Record<string, unknown>;
}

export function identifier(
  value: unknown,
  path: string
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0)
    validationError(path, 'must be a nonempty string');
}

export function counter(
  value: unknown,
  path: string,
  minimum: number
): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    validationError(path, `must be a safe integer >= ${minimum}`);
}
