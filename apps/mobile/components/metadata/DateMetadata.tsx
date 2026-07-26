import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { Clock3, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export type DateValue = {
  date: string;
  time?: string;
};

type DateMetadataProps = {
  value: DateValue;
  onChange: (value: DateValue) => void;
  disabled?: boolean;
};

type PickerMode = 'date' | 'time';

const pad = (value: number) => value.toString().padStart(2, '0');

function toPickerDate(value: DateValue, mode: PickerMode) {
  const now = new Date();
  const [parsedYear, parsedMonth, parsedDay] = value.date
    .split('-')
    .map(Number);
  const [parsedHours, parsedMinutes] = value.time
    ? value.time.split(':').map(Number)
    : [now.getHours(), now.getMinutes()];
  const year = parsedYear ?? now.getFullYear();
  const month = parsedMonth ?? now.getMonth() + 1;
  const day = parsedDay ?? now.getDate();
  const hours = parsedHours ?? now.getHours();
  const minutes = parsedMinutes ?? now.getMinutes();

  return new Date(
    year,
    month - 1,
    day,
    mode === 'time' ? hours : 12,
    mode === 'time' ? minutes : 0
  );
}

function formatDateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTimeValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function currentDateValue(): DateValue {
  const now = new Date();

  return {
    date: formatDateValue(now),
    time: formatTimeValue(now),
  };
}

export default function DateMetadata({
  value,
  onChange,
  disabled = false,
}: DateMetadataProps) {
  const { colors } = useTheme();
  const [iosPickerMode, setIosPickerMode] = useState<PickerMode | null>(null);

  const formattedDate = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(toPickerDate(value, 'date')),
    [value]
  );

  const applyPickerValue = (mode: PickerMode, selectedDate?: Date) => {
    if (!selectedDate) return;

    onChange(
      mode === 'date'
        ? { ...value, date: formatDateValue(selectedDate) }
        : { ...value, time: formatTimeValue(selectedDate) }
    );
  };

  const openPicker = (mode: PickerMode) => {
    if (disabled) return;

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        mode,
        value: toPickerDate(value, mode),
        is24Hour: true,
        onChange: (event, selectedDate) => {
          if (event.type === 'set') applyPickerValue(mode, selectedDate);
        },
      });
      return;
    }

    setIosPickerMode((current) => (current === mode ? null : mode));
  };

  const handleIosChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!iosPickerMode || event.type === 'dismissed') return;
    applyPickerValue(iosPickerMode, selectedDate);
  };

  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Change date, currently ${formattedDate}`}
          disabled={disabled}
          onPress={() => openPicker('date')}
          style={({ pressed }) => [
            styles.valueButton,
            {
              borderColor: colors.border,
              opacity: disabled ? 0.55 : 1,
            },
            pressed && { backgroundColor: colors.interactivePressed },
          ]}
        >
          <Text style={[styles.valueText, { color: colors.textSecondary }]}>
            {formattedDate}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            value.time ? `Change time, currently ${value.time}` : 'Add time'
          }
          disabled={disabled}
          onPress={() => openPicker('time')}
          style={({ pressed }) => [
            styles.timeButton,
            pressed && { backgroundColor: colors.interactivePressed },
          ]}
        >
          <Clock3 color={colors.textMuted} size={14} strokeWidth={2} />
          <Text style={[styles.valueText, { color: colors.textSecondary }]}>
            {value.time ?? 'Add time'}
          </Text>
        </Pressable>

        {value.time && !disabled && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove time"
            hitSlop={spacing[2]}
            onPress={() => {
              setIosPickerMode(null);
              onChange({ date: value.date });
            }}
            style={({ pressed }) => [
              styles.removeTimeButton,
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <X color={colors.textMuted} size={14} strokeWidth={2} />
          </Pressable>
        )}
      </View>

      {Platform.OS === 'ios' && iosPickerMode && (
        <View style={[styles.iosPicker, { borderTopColor: colors.border }]}>
          <DateTimePicker
            display={iosPickerMode === 'date' ? 'inline' : 'spinner'}
            mode={iosPickerMode}
            value={toPickerDate(value, iosPickerMode)}
            is24Hour
            onChange={handleIosChange}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => setIosPickerMode(null)}
            style={({ pressed }) => [
              styles.doneButton,
              pressed && { backgroundColor: colors.interactivePressed },
            ]}
          >
            <Text style={[styles.doneText, { color: colors.text }]}>Done</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  controls: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  valueButton: {
    minHeight: 34,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[2],
  },
  timeButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.sm,
    paddingHorizontal: spacing[1],
  },
  valueText: {
    ...typography.small,
  },
  removeTimeButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  iosPicker: {
    borderTopWidth: 1,
    padding: spacing[2],
  },
  doneButton: {
    minHeight: 36,
    alignSelf: 'flex-end',
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing[3],
  },
  doneText: {
    ...typography.small,
    fontWeight: '600',
  },
});
