import { expect, it } from 'vitest';
import {
  conflictFieldLabel,
  formatConflictValue,
} from './conflictPresentation';

it('labels empty notes and unset time explicitly', () => {
  expect(formatConflictValue('time', null)).toBe('No time set');
  expect(formatConflictValue('notes', '')).toBe('No notes');
});

it('preserves full notes, whitespace, and local dates/times', () => {
  const notes = '# Heading\n\n**Notes** ' + 'long '.repeat(1000);
  expect(formatConflictValue('notes', notes)).toBe(notes);
  expect(formatConflictValue('notes', ' ')).toBe(' ');
  expect(formatConflictValue('date', '2026-09-30')).toBe('2026-09-30');
  expect(formatConflictValue('time', '00:00')).toBe('00:00');
});

it('uses readable field and significance labels', () => {
  expect(conflictFieldLabel('significance')).toBe('Significance');
  expect(formatConflictValue('significance', 'turning-point')).toBe(
    'Turning point'
  );
  expect(formatConflictValue('significance', 'major')).toBe('Major');
});
