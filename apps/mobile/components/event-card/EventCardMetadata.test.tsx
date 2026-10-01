import { isValidElement, type ReactNode } from 'react';
import { it, expect, vi } from 'vitest';
import EventCardMetadata from './EventCardMetadata';
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
}));
vi.mock('lucide-react-native', () => ({
  ChevronUp: 'Up',
  ChevronDown: 'Down',
}));
vi.mock('@lel/design', () => ({ spacing: {} }));
vi.mock('./eventCardStyles', () => ({ eventCardStyles: {} }));
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (isValidElement<{ children: ReactNode }>(node))
    return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : '';
}
it('reveals all people and tags on expansion and restores compact metadata on collapse', () => {
  const props = {
    title: 'Dinner',
    tags: ['one', 'two', 'three'],
    people: ['Sam', 'Lea', 'Nora'],
    colors: {} as Parameters<typeof EventCardMetadata>[0]['colors'],
    hasExpandableContent: true,
    onToggleExpanded: vi.fn(),
  };
  const collapsed = text(EventCardMetadata({ ...props, isExpanded: false }));
  const expanded = text(EventCardMetadata({ ...props, isExpanded: true }));
  expect(collapsed).not.toContain('@Nora');
  expect(collapsed).not.toContain('#three');
  expect(expanded).toContain('@Nora');
  expect(expanded).toContain('#three');
  expect(expanded).not.toContain('+1');
});
