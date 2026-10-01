import {
  isValidElement,
  type ReactNode,
  type ReactElement,
  type ComponentProps,
} from 'react';
import { expect, it, vi } from 'vitest';
import EventCardExpandedContent from './EventCardExpandedContent';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/data/query', () => ({ useEventQuery: query }));
vi.mock('@/components/ui/AppToastProvider', () => ({
  useAppToast: () => ({ showToast: vi.fn() }),
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'Loading',
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  Linking: { openURL: vi.fn() },
}));
vi.mock('react-native-markdown-display', () => ({ default: 'Markdown' }));
vi.mock('./eventCardStyles', () => ({ eventCardStyles: {} }));
const props = {
  event: { event: { id: 'event-1', notesPreview: 'Excerpt' } },
  colors: {},
} as ComponentProps<typeof EventCardExpandedContent>;
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...nodes(element.props.children as ReactNode)];
}
function reader() {
  const element = EventCardExpandedContent(props)!;
  return (element.type as (props: unknown) => ReactNode)(element.props);
}
it('does not query notes for metadata-only expansion', () => {
  query.mockClear();
  expect(
    EventCardExpandedContent({
      ...props,
      event: {
        ...props.event,
        event: { ...props.event.event, notesPreview: null },
      },
    })
  ).toBeNull();
  expect(query).not.toHaveBeenCalled();
});
it('renders a loading state instead of pretending the excerpt is full notes', () => {
  query.mockReturnValue({ isPending: true });
  expect(nodes(reader())[0]?.type).toBe('Loading');
});
it('allows retry without opening the event', () => {
  const refetch = vi.fn();
  const stopPropagation = vi.fn();
  query.mockReturnValue({ isError: true, refetch });
  const retry = nodes(reader())[0]!;
  (retry.props.onPress as (event: unknown) => void)({ stopPropagation });
  expect(stopPropagation).toHaveBeenCalled();
  expect(refetch).toHaveBeenCalled();
});
it('passes the complete long note to the inline Markdown reader', () => {
  const notes =
    '# A long memory\n\n' + 'A paragraph with details.\n\n'.repeat(400);
  query.mockReturnValue({ data: { notes } });
  const markdown = nodes(reader()).find(
    (node) => node.type === ('Markdown' as unknown)
  );
  expect(markdown?.props.children).toBe(notes);
  expect(query).toHaveBeenCalledWith('event-1');
});
