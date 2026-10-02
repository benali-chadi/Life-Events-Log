import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import type { groupEventsByDate } from './groupEventsByDate';
import {
  firstVisibleTimelineEventId,
  pinnedTimelineTitle,
} from './timelineViewability';

export type TimelineDateStripHandle = {
  updateVisibleItems: (items: ViewToken[]) => void;
  updateScrollOffset: (offset: number) => void;
};

type Props = { sections: ReturnType<typeof groupEventsByDate> };

const TimelineDateStrip = forwardRef<TimelineDateStripHandle, Props>(
  function TimelineDateStrip({ sections }, ref) {
    const { colors } = useTheme();
    const { fontScale } = useWindowDimensions();
    const [atStart, setAtStart] = useState(true);
    const [visibleEventId, setVisibleEventId] = useState<string | null>(null);
    const titles = useMemo(() => {
      const result = new Map<string, string>();
      for (const section of sections) {
        for (const item of section.data)
          result.set(item.event.id, section.title);
      }
      return result;
    }, [sections]);

    const eventOrder = useMemo(
      () => new Map(Array.from(titles.keys(), (id, index) => [id, index])),
      [titles]
    );

    useImperativeHandle(
      ref,
      () => ({
        updateScrollOffset(offset) {
          setAtStart(offset <= 1);
        },
        updateVisibleItems(items) {
          const id = firstVisibleTimelineEventId(items, eventOrder);
          if (id !== null) setVisibleEventId(id);
        },
      }),
      [eventOrder]
    );

    const title = pinnedTimelineTitle(titles, visibleEventId, atStart);
    if (!title) return null;

    return (
      <View
        style={[
          styles.strip,
          {
            height: Math.max(40, Math.ceil(20 * fontScale + 16)),
            backgroundColor: colors.bg,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.label, { color: colors.textSecondary }]}
        >
          {title}
        </Text>
      </View>
    );
  }
);

export default TimelineDateStrip;

const styles = StyleSheet.create({
  strip: {
    justifyContent: 'center',
    paddingLeft: 32,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { ...typography.small, fontWeight: '500' },
});
