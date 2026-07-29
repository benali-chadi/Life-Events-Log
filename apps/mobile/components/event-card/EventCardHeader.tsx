import type { useTheme } from '@lel/design/useTheme';
import { useEffect, useState } from 'react';
import type { NativeSyntheticEvent, TextLayoutEventData } from 'react-native';
import { Text, View } from 'react-native';
import {
  significanceLevels,
  type getSignificanceStyle,
} from './eventCardSignificance';
import { eventCardStyles as styles } from './eventCardStyles';
import type { EventSignificance } from '@/models';

const COLLAPSED_TITLE_LINE_LIMIT = 2;

type EventCardHeaderProps = {
  title: string;
  time?: string;
  significance: EventSignificance;
  significanceStyle: ReturnType<typeof getSignificanceStyle>;
  colors: ReturnType<typeof useTheme>['colors'];
  isExpanded: boolean;
  onTitleOverflowChange: (hasOverflow: boolean) => void;
};

export default function EventCardHeader({
  title,
  time,
  significance,
  significanceStyle,
  colors,
  isExpanded,
  onTitleOverflowChange,
}: EventCardHeaderProps) {
  const [hasMeasuredTitle, setHasMeasuredTitle] = useState(false);

  useEffect(() => {
    setHasMeasuredTitle(false);
    onTitleOverflowChange(false);
  }, [onTitleOverflowChange, title]);

  const handleTitleLayout = (
    event: NativeSyntheticEvent<TextLayoutEventData>
  ) => {
    if (hasMeasuredTitle) return;

    onTitleOverflowChange(
      event.nativeEvent.lines.length > COLLAPSED_TITLE_LINE_LIMIT
    );
    setHasMeasuredTitle(true);
  };

  return (
    <View style={styles.headerRow}>
      <Text
        numberOfLines={
          isExpanded || !hasMeasuredTitle
            ? undefined
            : COLLAPSED_TITLE_LINE_LIMIT
        }
        onTextLayout={handleTitleLayout}
        style={[styles.title, significanceStyle.title, { color: colors.text }]}
      >
        {title}
      </Text>
      <View style={styles.headerMeta}>
        {time && (
          <Text style={[styles.date, { color: colors.textMuted }]}>{time}</Text>
        )}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.significanceMarker}
        >
          {Array.from({ length: significanceLevels[significance] }).map(
            (_, index) => (
              <View
                key={index}
                style={[
                  styles.significanceSegment,
                  { backgroundColor: significanceStyle.markerColor },
                ]}
              />
            )
          )}
        </View>
      </View>
    </View>
  );
}
