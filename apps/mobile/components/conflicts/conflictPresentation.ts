export function conflictFieldLabel(field: string): string {
  return field[0]!.toUpperCase() + field.slice(1);
}

export function formatConflictValue(
  field: string,
  value: string | null
): string {
  if (value === null || value === '')
    return field === 'time'
      ? 'No time set'
      : field === 'notes'
        ? 'No notes'
        : 'Empty value';
  if (field === 'significance')
    return value === 'turning-point'
      ? 'Turning point'
      : conflictFieldLabel(value);
  // Keep dates as YYYY-MM-DD and times as HH:mm: exact local values, no timezone conversion.
  return value;
}
