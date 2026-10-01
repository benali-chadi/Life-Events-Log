import type { Timestamp, UUID } from './primitives';

export const CATEGORY_COLOR_VALUES = [
  'blue',
  'green',
  'rose',
  'amber',
  'violet',
  'teal',
  'cyan',
  'coral',
  'olive',
  'brown',
  'slate',
  'navy',
  'magenta',
] as const;

export type CategoryColor = (typeof CATEGORY_COLOR_VALUES)[number];

export type Category = {
  id: UUID;

  name: string;
  /** Derived read-model label; never persisted or synced. */
  displayName?: string;
  color: CategoryColor;

  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
};
