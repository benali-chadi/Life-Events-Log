import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import ConflictResolutionSheet from './ConflictResolutionSheet';
import ConflictIndicator from './ConflictIndicator';
import type { FieldConflict } from '@/data/sqlite/sync/conflicts/createConflictService';

// Shallow component interaction tests; native layout and modal behavior need Android verification.
const state = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  showToast: vi.fn(),
  setError: vi.fn(),
  pending: false,
}));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: () => [null, state.setError],
  useRef: (current: unknown) => ({ current }),
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (styles: unknown) => styles },
  useWindowDimensions: () => ({ height: 800 }),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 24 }),
}));
vi.mock('lucide-react-native', () => ({
  GitCompareArrows: 'GitCompareArrows',
}));
vi.mock('@lel/design', () => ({
  eventColors: {
    blue: { light: '#blue', dark: '#darkblue' },
    rose: { light: '#rose', dark: '#darkrose' },
  },
  radius: { sm: 4, md: 8 },
  spacing: { 2: 8, 3: 12, 4: 16 },
  typography: {},
}));
vi.mock('@lel/design/useTheme', () => ({ useTheme: () => ({ colors: {} }) }));
vi.mock('@/components/ui/BottomSheetModal', () => ({
  default: 'BottomSheetModal',
}));
vi.mock('@/components/ui/AppToastProvider', () => ({
  useAppToast: () => ({ showToast: state.showToast }),
}));
vi.mock('@/data/query/useConflictQueries', () => ({
  useResolveConflictMutation: () => ({
    mutateAsync: state.mutateAsync,
    isPending: state.pending,
  }),
}));

type NodeProps = {
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  onRequestClose?: () => void;
};
function nodes(node: ReactNode): ReactElement<NodeProps>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<NodeProps>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
const conflict: FieldConflict = {
  conflictId: 'conflict',
  entityId: 'event',
  entityType: 'event',
  fieldName: 'title',
  currentValue: 'Current',
  alternativeValue: 'Alternative',
};
function render() {
  const onClose = vi.fn();
  const onResolved = vi.fn();
  const tree = ConflictResolutionSheet({ conflict, onClose, onResolved });
  const all = nodes(tree);
  const button = (label: string) =>
    all.find(
      (node) =>
        nodes(node.props.children).some(
          (child) => child.props.children === label
        ) && node.props.onPress
    )!;
  return { tree, onClose, onResolved, button };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.pending = false;
});

it.each(['current', 'alternative'] as const)(
  'saves %s then closes the sheet',
  async (choice) => {
    const result = {
      status: 'resolved',
      entityType: 'event',
      entityId: 'event',
    };
    state.mutateAsync.mockResolvedValue(result);
    const view = render();
    view.button(choice === 'current' ? 'Keep current' : 'Use alternative').props
      .onPress!();
    await vi.waitFor(() => expect(view.onClose).toHaveBeenCalledOnce());
    expect(state.mutateAsync).toHaveBeenCalledWith({
      conflictId: 'conflict',
      choice,
    });
    expect(view.onResolved).toHaveBeenCalledWith(choice, result);
  }
);

it('dismisses without a write and reports already-resolved after choosing', async () => {
  const view = render();
  view.tree.props.onRequestClose();
  expect(view.onClose).toHaveBeenCalledOnce();
  expect(state.mutateAsync).not.toHaveBeenCalled();
  state.mutateAsync.mockResolvedValue({ status: 'already-resolved' });
  view.button('Keep current').props.onPress!();
  await vi.waitFor(() =>
    expect(state.showToast).toHaveBeenCalledWith({
      message: 'Already resolved',
    })
  );
});

it('keeps failures open for retry', async () => {
  state.mutateAsync.mockRejectedValue(new Error('Write failed'));
  const view = render();
  view.button('Use alternative').props.onPress!();
  await vi.waitFor(() =>
    expect(state.setError).toHaveBeenCalledWith('Write failed')
  );
  expect(view.onClose).not.toHaveBeenCalled();
  expect(view.onResolved).not.toHaveBeenCalled();
});

it('blocks dismissal and duplicate submissions until the save settles', async () => {
  let finish!: (result: unknown) => void;
  state.mutateAsync.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const view = render();
  view.button('Keep current').props.onPress!();
  view.button('Use alternative').props.onPress!();
  view.tree.props.onRequestClose();
  expect(view.onClose).not.toHaveBeenCalled();
  expect(state.mutateAsync).toHaveBeenCalledOnce();
  finish({ status: 'resolved', entityType: 'event', entityId: 'event' });
  await vi.waitFor(() => expect(view.onClose).toHaveBeenCalledOnce());
  state.pending = true;
  expect(render().button('Keep current').props.disabled).toBe(true);
});

it('labels the comparison indicator and keeps it distinct from field editing', () => {
  const onPress = vi.fn();
  const indicator = ConflictIndicator({ fieldLabel: 'Time', onPress });
  expect(indicator.props.accessibilityLabel).toBe('Review conflicting time');
  indicator.props.onPress();
  expect(onPress).toHaveBeenCalledOnce();
});

it('shows metadata context and labeled swatches for both category color values', () => {
  const tree = ConflictResolutionSheet({
    conflict: {
      ...conflict,
      entityType: 'category',
      fieldName: 'color',
      currentValue: 'blue',
      alternativeValue: 'rose',
    },
    entityLabel: 'Travel · aaaaaaaa',
    onClose: vi.fn(),
    onResolved: vi.fn(),
  });
  const all = nodes(tree);
  expect(all.some((node) => node.props.children === 'Travel · aaaaaaaa')).toBe(
    true
  );
  expect(all.some((node) => node.props.children === 'Blue')).toBe(true);
  expect(all.some((node) => node.props.children === 'Rose')).toBe(true);
  expect(
    all.filter((node) =>
      node.props.accessibilityLabel?.endsWith('color swatch')
    )
  ).toHaveLength(2);
});
