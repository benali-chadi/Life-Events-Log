import { expect, it, vi } from 'vitest';
import {
  isValidElement,
  type ReactElement,
  type ReactNode,
  type ComponentProps,
} from 'react';
import EventCardHeader from './EventCardHeader';
import EventCardContent from './EventCardContent';

// Shallow presentation checks; touch/layout behavior is verified on Android.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: () => [false, vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
}));
vi.mock('lucide-react-native', () => ({
  GitCompareArrows: 'GitCompareArrows',
}));
vi.mock('@expo/vector-icons/MaterialIcons', () => ({
  default: 'MaterialIcons',
}));
vi.mock('@lel/design', () => ({ eventColors: {} }));
vi.mock('./eventCardStyles', () => ({ eventCardStyles: {} }));
vi.mock('./EventCardExpandedContent', () => ({ default: 'Expanded' }));
vi.mock('./EventCardMetadata', () => ({ default: 'Metadata' }));

function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...nodes(element.props.children as ReactNode)];
}

it.each([false, true])(
  'renders an informational header icon only for conflicts: %s',
  (hasConflicts) => {
    const props = {
      title: 'Trip',
      significance: 'ordinary',
      significanceStyle: {},
      colors: { warning: 'amber' },
      isExpanded: false,
      onTitleOverflowChange: vi.fn(),
      hasConflicts,
    } as unknown as ComponentProps<typeof EventCardHeader>;
    const icons = nodes(EventCardHeader(props)).filter(
      (node) => node.type === ('GitCompareArrows' as unknown)
    );
    expect(icons).toHaveLength(hasConflicts ? 1 : 0);
    if (hasConflicts) expect(icons[0]!.props.onPress).toBeUndefined();
  }
);

it.each([false, true])(
  'preserves navigation and announces conflict status: %s',
  (hasConflicts) => {
    const onOpen = vi.fn();
    const props = {
      event: { event: { title: 'Trip' }, tags: [], people: [] },
      significance: 'ordinary',
      colors: {},
      isDark: false,
      hasExpandableContent: false,
      isExpanded: false,
      onOpen,
      onToggleExpanded: vi.fn(),
      onTitleOverflowChange: vi.fn(),
      hasConflicts,
    } as unknown as ComponentProps<typeof EventCardContent>;
    const tree = EventCardContent(props);
    expect(tree.props.accessibilityLabel.includes('unresolved conflicts')).toBe(
      hasConflicts
    );
    expect(tree.props.onPress).toBe(onOpen);
    expect(
      nodes(tree).find((node) => node.type === EventCardHeader)?.props
        .hasConflicts
    ).toBe(hasConflicts);
  }
);
