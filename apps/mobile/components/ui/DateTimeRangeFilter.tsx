import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { controlSize, radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { CalendarRange, ChevronDown, Clock3, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LocalDate, LocalTime } from '@/models';
import BottomSheetModal from './BottomSheetModal';

type RangeMode = 'date' | 'time';
type RangeEndpoint = 'from' | 'to';

export type DateRangeValue = {
  from?: LocalDate;
  to?: LocalDate;
};

export type TimeRangeValue = {
  from?: LocalTime;
  to?: LocalTime;
};

type DateTimeRangeFilterProps =
  | {
      mode: 'date';
      value: DateRangeValue;
      onChange: (value: DateRangeValue) => void;
    }
  | {
      mode: 'time';
      value: TimeRangeValue;
      onChange: (value: TimeRangeValue) => void;
    };

const pad = (value: number) => value.toString().padStart(2, '0');

function formatValue(mode: RangeMode, date: Date) {
  return mode === 'date'
    ? (`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` as LocalDate)
    : (`${pad(date.getHours())}:${pad(date.getMinutes())}` as LocalTime);
}

function parseValue(mode: RangeMode, value: string) {
  const now = new Date();

  if (mode === 'date') {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year ?? now.getFullYear(), (month ?? 1) - 1, day ?? 1, 12);
  }

  const [hours, minutes] = value.split(':').map(Number);
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hours ?? 0,
    minutes ?? 0
  );
}

function initialPickerValue(
  mode: RangeMode,
  endpoint: RangeEndpoint,
  value: DateRangeValue | TimeRangeValue
) {
  const current = value[endpoint];

  if (current) return parseValue(mode, current);
  if (mode === 'date') {
    const boundary = endpoint === 'from' ? value.to : value.from;
    if (boundary) return parseValue(mode, boundary);
  }

  return new Date();
}

function displayValue(mode: RangeMode, value?: string) {
  if (!value) return 'Not set';
  if (mode === 'time') return value;

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parseValue(mode, value));
}

export default function DateTimeRangeFilter(props: DateTimeRangeFilterProps) {
  const { colors } = useTheme();
  const { mode, value } = props;
  const label = mode === 'date' ? 'Date' : 'Time';
  const [isOpen, setIsOpen] = useState(false);
  const [draftValue, setDraftValue] = useState(value);
  const [iosEndpoint, setIosEndpoint] = useState<RangeEndpoint | null>(null);
  const selectionCount =
    Number(Boolean(value.from)) + Number(Boolean(value.to));
  const draftSelectionCount =
    Number(Boolean(draftValue.from)) + Number(Boolean(draftValue.to));
  const isOvernight =
    mode === 'time' &&
    Boolean(
      draftValue.from && draftValue.to && draftValue.from > draftValue.to
    );

  const pickerBounds = useMemo(() => {
    if (mode !== 'date') return {};

    return {
      maximumDate:
        iosEndpoint === 'from' && draftValue.to
          ? parseValue(mode, draftValue.to)
          : undefined,
      minimumDate:
        iosEndpoint === 'to' && draftValue.from
          ? parseValue(mode, draftValue.from)
          : undefined,
    };
  }, [draftValue.from, draftValue.to, iosEndpoint, mode]);

  const close = () => {
    setIosEndpoint(null);
    setIsOpen(false);
  };

  const cancel = () => {
    setDraftValue(value);
    close();
  };

  const open = () => {
    setDraftValue(value);
    setIsOpen(true);
  };

  const updateEndpoint = (endpoint: RangeEndpoint, selectedDate?: Date) => {
    if (!selectedDate) return;

    setDraftValue((current) => ({
      ...current,
      [endpoint]: formatValue(mode, selectedDate),
    }));
  };

  const openPicker = (endpoint: RangeEndpoint) => {
    if (Platform.OS === 'android') {
      const dateValue = draftValue as DateRangeValue;
      DateTimePickerAndroid.open({
        mode,
        value: initialPickerValue(mode, endpoint, draftValue),
        is24Hour: true,
        maximumDate:
          mode === 'date' && endpoint === 'from' && dateValue.to
            ? parseValue(mode, dateValue.to)
            : undefined,
        minimumDate:
          mode === 'date' && endpoint === 'to' && dateValue.from
            ? parseValue(mode, dateValue.from)
            : undefined,
        onChange: (event, selectedDate) => {
          if (event.type === 'set') updateEndpoint(endpoint, selectedDate);
        },
      });
      return;
    }

    setIosEndpoint((current) => (current === endpoint ? null : endpoint));
  };

  const handleIosChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!iosEndpoint || event.type === 'dismissed') return;
    updateEndpoint(iosEndpoint, selectedDate);
  };

  const apply = () => {
    if (props.mode === 'date') props.onChange(draftValue as DateRangeValue);
    else props.onChange(draftValue as TimeRangeValue);
    close();
  };

  return (
    <>
      <Pressable
        accessibilityLabel={`${label} filter, ${selectionCount} boundaries selected`}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={open}
        style={({ pressed }) => [
          styles.trigger,
          { borderColor: colors.border, backgroundColor: colors.surface },
          selectionCount > 0 && {
            borderColor: colors.borderStrong,
            backgroundColor: colors.interactiveMuted,
          },
          pressed && { backgroundColor: colors.interactivePressed },
        ]}
      >
        {mode === 'date' ? (
          <CalendarRange color={colors.textSecondary} size={15} />
        ) : (
          <Clock3 color={colors.textSecondary} size={15} />
        )}
        <Text
          style={[
            styles.triggerText,
            { color: selectionCount ? colors.text : colors.textSecondary },
          ]}
        >
          {label}
        </Text>
        {selectionCount > 0 && (
          <View
            style={[
              styles.selectionCount,
              { backgroundColor: colors.surfaceElevated },
            ]}
          >
            <Text style={[styles.countText, { color: colors.textSecondary }]}>
              {selectionCount}
            </Text>
          </View>
        )}
        <ChevronDown color={colors.textSecondary} size={16} />
      </Pressable>

      <BottomSheetModal
        closeAccessibilityLabel={`Close ${label.toLowerCase()} filter`}
        onRequestClose={cancel}
        sheetStyle={styles.sheet}
        visible={isOpen}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: colors.text }]}>
              {label} range
            </Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              Set either boundary or both
            </Text>
          </View>
          <Pressable
            accessibilityLabel={`Close ${label.toLowerCase()} filter`}
            accessibilityRole="button"
            hitSlop={spacing[2]}
            onPress={cancel}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: colors.interactiveMuted },
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <X color={colors.textSecondary} size={20} />
          </Pressable>
        </View>

        <View style={styles.rangeRows}>
          {(['from', 'to'] as const).map((endpoint) => (
            <View key={endpoint}>
              <View style={styles.rangeRow}>
                <View style={styles.endpointLabel}>
                  <Text style={[styles.endpointTitle, { color: colors.text }]}>
                    {endpoint === 'from' ? 'From' : 'To'}
                  </Text>
                  <Text
                    style={[styles.endpointValue, { color: colors.textMuted }]}
                  >
                    {displayValue(mode, draftValue[endpoint])}
                  </Text>
                </View>
                {draftValue[endpoint] && (
                  <Pressable
                    accessibilityLabel={`Clear ${endpoint} ${label.toLowerCase()}`}
                    hitSlop={spacing[2]}
                    onPress={() => {
                      setIosEndpoint(null);
                      setDraftValue((current) => ({
                        ...current,
                        [endpoint]: undefined,
                      }));
                    }}
                    style={styles.clearEndpoint}
                  >
                    <X color={colors.textMuted} size={16} />
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openPicker(endpoint)}
                  style={({ pressed }) => [
                    styles.chooseButton,
                    { borderColor: colors.border },
                    pressed && { backgroundColor: colors.interactivePressed },
                  ]}
                >
                  <Text style={[styles.chooseText, { color: colors.text }]}>
                    {draftValue[endpoint] ? 'Change' : 'Choose'}
                  </Text>
                </Pressable>
              </View>

              {Platform.OS === 'ios' && iosEndpoint === endpoint && (
                <View
                  style={[styles.iosPicker, { borderTopColor: colors.border }]}
                >
                  <DateTimePicker
                    display={mode === 'date' ? 'inline' : 'spinner'}
                    is24Hour
                    mode={mode}
                    onChange={handleIosChange}
                    value={initialPickerValue(mode, endpoint, draftValue)}
                    {...pickerBounds}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setIosEndpoint(null)}
                    style={styles.pickerDone}
                  >
                    <Text style={[styles.doneText, { color: colors.text }]}>
                      Done
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </View>

        {mode === 'time' && (
          <Text style={[styles.rangeHint, { color: colors.textMuted }]}>
            {isOvernight
              ? 'Overnight range: it continues past midnight.'
              : 'Events without a known time will be excluded.'}
          </Text>
        )}

        <View
          style={[
            styles.footer,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.surfaceElevated,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            disabled={draftSelectionCount === 0}
            onPress={() => {
              setIosEndpoint(null);
              setDraftValue({});
            }}
            style={({ pressed }) => [
              styles.clearButton,
              { borderColor: colors.borderStrong },
              draftSelectionCount === 0 && styles.disabled,
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <Text style={[styles.clearText, { color: colors.textSecondary }]}>
              Clear
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={apply}
            style={({ pressed }) => [
              styles.applyButton,
              { backgroundColor: colors.primary },
              pressed && { backgroundColor: colors.primaryPressed },
            ]}
          >
            <Text style={[styles.applyText, { color: colors.onPrimary }]}>
              Apply
            </Text>
          </Pressable>
        </View>
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    height: controlSize.sm,
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  triggerText: { ...typography.small },
  selectionCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: spacing[1],
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { ...typography.caption },
  sheet: { maxHeight: '92%', paddingTop: spacing[2] },
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  headerText: { flex: 1 },
  title: { ...typography.h3 },
  subtitle: { ...typography.caption, marginTop: spacing[1] },
  iconButton: {
    width: controlSize.sm,
    height: controlSize.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeRows: { paddingHorizontal: spacing[4], gap: spacing[2] },
  rangeRow: {
    minHeight: controlSize.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  endpointLabel: { flex: 1 },
  endpointTitle: { ...typography.small, fontWeight: '500' },
  endpointValue: { ...typography.caption, marginTop: spacing[1] },
  clearEndpoint: {
    width: controlSize.sm,
    height: controlSize.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooseButton: {
    minHeight: controlSize.sm,
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooseText: { ...typography.small, fontWeight: '500' },
  iosPicker: { borderTopWidth: 1, paddingVertical: spacing[2] },
  pickerDone: {
    minHeight: controlSize.sm,
    alignSelf: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  doneText: { ...typography.small, fontWeight: '600' },
  rangeHint: {
    ...typography.caption,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  footer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing[3],
  },
  clearButton: {
    height: controlSize.md,
    paddingHorizontal: spacing[4],
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearText: { ...typography.small, fontWeight: '500' },
  applyButton: {
    flex: 1,
    height: controlSize.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: { ...typography.small, fontWeight: '500' },
  disabled: { opacity: 0.45 },
});
