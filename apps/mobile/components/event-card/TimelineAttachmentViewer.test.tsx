import { isValidElement, type ReactNode, type ReactElement } from 'react';
import { expect, it, vi } from 'vitest';
import TimelineAttachmentViewer from './TimelineAttachmentViewer';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/data/query', () => ({ useEventAttachmentsQuery: query }));
vi.mock('@lel/design/useTheme', () => ({ useTheme: () => ({ colors: {} }) }));
vi.mock('@/data/attachments', () => ({
  resolveAttachmentFile: (hash: string) => ({
    uri: hash,
    isAvailable: hash !== 'missing',
  }),
}));
vi.mock('@/components/event-attachments/AttachmentViewer', () => ({
  default: 'Viewer',
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'Loading',
  Modal: 'Modal',
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
}));
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...nodes(element.props.children as ReactNode)];
}
const props = { eventId: 'event-1', attachmentId: 'second', onClose: vi.fn() };
it('opens the selected ID after attachment reordering and retains missing files', () => {
  query.mockReturnValue({
    data: [
      { id: 'second', contentHash: 'missing' },
      { id: 'first', contentHash: 'first' },
    ],
  });
  const tree = TimelineAttachmentViewer(props);
  expect(tree.props.initialIndex).toBe(0);
  expect(tree.props.attachments[0].isAvailable).toBe(false);
  expect(tree.props.onClose).toBe(props.onClose);
});
it('allows cancellation while loading', () => {
  query.mockReturnValue({ isPending: true });
  const tree = TimelineAttachmentViewer(props);
  expect(tree.props.onRequestClose).toBe(props.onClose);
  expect(nodes(tree).some((node) => node.type === ('Loading' as unknown))).toBe(
    true
  );
  expect(nodes(tree).some((node) => node.props.onPress === props.onClose)).toBe(
    true
  );
});
it('offers retry and close after failure', () => {
  const refetch = vi.fn();
  query.mockReturnValue({ isError: true, refetch });
  const controls = nodes(TimelineAttachmentViewer(props)).filter(
    (node) => node.type === ('Pressable' as unknown)
  );
  (controls[0]!.props.onPress as () => void)();
  expect(refetch).toHaveBeenCalled();
  expect(controls[1]!.props.onPress).toBe(props.onClose);
});
it('does not mount an empty viewer when attachments were removed', () => {
  query.mockReturnValue({ data: [] });
  expect(
    nodes(TimelineAttachmentViewer(props)).some(
      (node) => node.type === ('Viewer' as unknown)
    )
  ).toBe(false);
});
