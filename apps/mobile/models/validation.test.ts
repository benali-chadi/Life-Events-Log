import { expect, it } from 'vitest';
import {
  isValidLocalDate,
  isValidLocalTime,
  isValidTimestamp,
} from './validation';

it.each([
  '0000-02-29',
  '0099-01-01',
  '0100-01-01',
  '2000-02-29',
  '2024-02-29',
  '9999-12-31',
])('accepts calendar date %s', (value) => {
  expect(isValidLocalDate(value)).toBe(true);
});
it.each([
  null,
  undefined,
  20240101,
  '',
  '2024-2-01',
  '2023-02-29',
  '1900-02-29',
  '0100-02-29',
  '2024-04-31',
  '2024-00-01',
  '2024-13-01',
  '2024-01-00',
  '2024-01-32',
  '2024-01-01T00:00:00.000Z',
])('rejects invalid calendar date %s', (value) => {
  expect(isValidLocalDate(value)).toBe(false);
});
it.each(['00:00', '09:05', '23:59'])('accepts local time %s', (value) => {
  expect(isValidLocalTime(value)).toBe(true);
});
it.each([
  null,
  undefined,
  1200,
  '',
  '9:00',
  '24:00',
  '12:60',
  '12:00:00',
  '12:00Z',
  ' 12:00',
])('rejects invalid local time %s', (value) => {
  expect(isValidLocalTime(value)).toBe(false);
});
it.each([
  '0000-02-29T00:00:00.000Z',
  '0099-01-01T00:00:00.000Z',
  '2024-02-29T23:59:59.999Z',
])('accepts canonical timestamp %s', (value) => {
  expect(isValidTimestamp(value)).toBe(true);
});
it.each([
  null,
  undefined,
  0,
  '2023-02-29T00:00:00.000Z',
  '2024-01-01T24:00:00.000Z',
  '2024-01-01T00:00:00Z',
  '2024-01-01T00:00:00.000+00:00',
  '2024-01-01',
])('rejects invalid timestamp %s', (value) => {
  expect(isValidTimestamp(value)).toBe(false);
});
