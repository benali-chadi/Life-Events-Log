import { beforeEach, expect, it, vi } from 'vitest';
import { isValidElement, type ReactNode, type ReactElement } from 'react';
import MetadataUsageSection from './MetadataUsageSection';
import type { MetadataSectionId } from './MetadataTabs';
import type { FieldConflict } from '@/data/sqlite/sync/conflicts/createConflictService';

const state = vi.hoisted(() => ({
  conflicts: [] as FieldConflict[],
  selected: false,
  deleting: false,
  setState: vi.fn(),
  closeSwipe: vi.fn(),
  conflictQuery: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useMemo: (run: () => unknown) => run(),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [
    typeof initial === 'function'
      ? new Set(state.selected ? ['id'] : [])
      : initial,
    state.setState,
  ],
}));
vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  FlatList: 'FlatList',
  Pressable: 'Pressable',
  Text: 'Text',
  View: 'View',
  Platform: { OS: 'android' },
  StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('@lel/design', () => ({
  eventColors: { blue: { light: 'blue' } },
  radius: {},
  spacing: {},
  typography: {},
}));
vi.mock('@lel/design/useTheme', () => ({
  useTheme: () => ({ colors: {}, isDark: false }),
}));
vi.mock('lucide-react-native', () =>
  Object.fromEntries(
    [
      'ArrowDown',
      'ArrowUp',
      'Check',
      'ChevronRight',
      'Plus',
      'Trash2',
      'X',
    ].map((name) => [name, name])
  )
);
vi.mock('../metadata/CategoryCreationSheet', () => ({
  default: 'CategoryCreationSheet',
}));
vi.mock('../metadata/suggestCategoryColor', () => ({
  suggestCategoryColor: () => 'blue',
}));
vi.mock('../ui/SearchInput', () => ({ default: 'SearchInput' }));
vi.mock('../ui/select', () => ({
  normalizeOptionValue: (value: string) => value.toLowerCase(),
}));
vi.mock('../ui/SwipeReveal', () => ({
  default: 'SwipeReveal',
  closeOpenSwipe: state.closeSwipe,
}));
vi.mock('./NamedMetadataEditSheet', () => ({
  default: 'NamedMetadataEditSheet',
}));
vi.mock('../conflicts/ConflictIndicator', () => ({
  default: 'ConflictIndicator',
}));
vi.mock('../conflicts/ConflictResolutionSheet', () => ({
  default: 'ConflictResolutionSheet',
}));
vi.mock('./MetadataDeletionProvider', () => ({
  useMetadataDeletion: () => ({
    pendingKind: 'category',
    pendingIds: new Set(state.deleting ? ['id'] : []),
    requestDeletion: vi.fn(),
    requestManyDeletions: vi.fn(),
  }),
}));
vi.mock('@/data/query', () => {
  const query = () => ({
    data: [
      { metadata: { id: 'id', name: 'Travel', color: 'blue' }, eventCount: 2 },
    ],
    refetch: state.refetch,
  });
  const mutation = () => ({
    reset: vi.fn(),
    mutate: vi.fn(),
    isPending: false,
  });
  return {
    ...Object.fromEntries(
      [
        'useCategoriesQuery',
        'useCategoriesWithUsageQuery',
        'useLocationsWithUsageQuery',
        'usePeopleWithUsageQuery',
        'useTagsWithUsageQuery',
      ].map((name) => [name, query])
    ),
    ...Object.fromEntries(
      [
        'useCreateCategoryMutation',
        'useCreateLocationMutation',
        'useCreatePersonMutation',
        'useCreateTagMutation',
        'useUpdateCategoryMutation',
        'useUpdateLocationMutation',
        'useUpdatePersonMutation',
        'useUpdateTagMutation',
      ].map((name) => [name, mutation])
    ),
    useMetadataConflictsQuery: (type: string) => {
      state.conflictQuery(type);
      return { data: state.conflicts, refetch: state.refetch };
    },
  };
});

type Props = {
  children?: ReactNode;
  fieldLabel?: string;
  onPress?: () => void;
  onRefresh?: () => void;
  renderItem?: (input: { item: unknown }) => ReactNode;
  data?: unknown[];
};
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function invoke(node: ReactElement) {
  return (node.type as (props: unknown) => ReactElement)(node.props);
}
function render(section: MetadataSectionId = 'categories') {
  const sectionNode = MetadataUsageSection({
    section,
    search: '',
    usageOrder: 'most',
    onSearchChange: vi.fn(),
    onUsageOrderChange: vi.fn(),
  });
  const sectionTree = invoke(sectionNode);
  const listComponent = nodes(sectionTree).find(
    (node) => typeof node.type === 'function'
  )!;
  const tree = invoke(listComponent);
  const list = nodes(tree).find((node) => String(node.type) === 'FlatList')!;
  const row = list.props.renderItem!({ item: list.props.data![0] });
  const indicators = nodes(row).filter(
    (node) => String(node.type) === 'ConflictIndicator'
  );
  return { row, indicators, list };
}
beforeEach(() => {
  vi.clearAllMocks();
  state.selected = false;
  state.deleting = false;
  state.conflicts = ['name', 'color'].map((fieldName) => ({
    conflictId: fieldName,
    entityType: 'category',
    entityId: 'id',
    fieldName,
    currentValue: 'blue',
    alternativeValue: 'rose',
  }));
});

it('opens the selected name/color conflict without opening row editing', () => {
  const { indicators } = render();
  expect(indicators.map((node) => node.props.fieldLabel)).toEqual([
    'color for Travel',
    'name for Travel',
  ]);
  for (const indicator of indicators) {
    state.setState.mockClear();
    indicator.props.onPress!();
    expect(state.setState).toHaveBeenCalledOnce();
    expect(state.setState).toHaveBeenCalledWith({
      conflict: state.conflicts.find((row) =>
        indicator.props.fieldLabel!.startsWith(row.fieldName)
      ),
      label: 'Travel',
    });
  }
  expect(state.closeSwipe).toHaveBeenCalledTimes(2);
});

it.each(['selection', 'pending deletion'])(
  'hides review controls during %s',
  (mode) => {
    state.selected = mode === 'selection';
    state.deleting = mode === 'pending deletion';
    expect(render().indicators).toHaveLength(0);
  }
);

it.each([
  ['tags', 'tag'],
  ['people', 'person'],
  ['locations', 'location'],
] as const)('loads %s conflicts once for the tab', (section, type) => {
  state.conflicts = [{ ...state.conflicts[0]!, entityType: type }];
  const { indicators, list } = render(section);
  expect(state.conflictQuery).toHaveBeenCalledExactlyOnceWith(type);
  expect(indicators).toHaveLength(1);
  list.props.onRefresh!();
  expect(state.refetch).toHaveBeenCalledTimes(2);
});
