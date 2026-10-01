import type { useTheme } from '@lel/design/useTheme';

import type { NativeSyntheticEvent, TextLayoutEventData } from 'react-native';
import { Text, View } from 'react-native';
import { GitCompareArrows } from 'lucide-react-native';
import {
  significanceLabels,
  type getSignificanceStyle,
} from './eventCardSignificance';
import { eventCardStyles as styles } from './eventCardStyles';
import type { EventSignificance } from '@/models';

const COLLAPSED_TITLE_LINE_LIMIT = 2;

type EventCardHeaderProps = {
  hasConflicts?: boolean;
  title: string;
  time?: string;
  significance: EventSignificance;
  significanceStyle: ReturnType<typeof getSignificanceStyle>;
  colors: ReturnType<typeof useTheme>['colors'];
  isExpanded: boolean;
  onTitleOverflowChange: (hasOverflow: boolean) => void;
};

export default function EventCardHeader({
  hasConflicts = false,
  title,
  time,
  significance,
  significanceStyle,
  colors,
  isExpanded,
  onTitleOverflowChange,
}: EventCardHeaderProps) {
  const handleTitleLayout = (
    event: NativeSyntheticEvent<TextLayoutEventData>
  ) => {
    onTitleOverflowChange(
      event.nativeEvent.lines.length > COLLAPSED_TITLE_LINE_LIMIT
    );
  };

  return (
    <View style={styles.headerRow}>
      <View style={styles.headerMeta}>
        {hasConflicts && (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <GitCompareArrows size={18} color={colors.warning} />
          </View>
        )}
        {time && (
          <Text style={[styles.date, { color: colors.textMuted }]}>{time}</Text>
        )}
        {significance !== 'ordinary' && (
          <Text style={[styles.date, { color: colors.textMuted }]}>
            {significanceLabels[significance]}
          </Text>
        )}
      </View>
      <View>
        <Text
          numberOfLines={isExpanded ? undefined : COLLAPSED_TITLE_LINE_LIMIT}
          style={[
            styles.title,
            significanceStyle.title,
            { color: colors.text },
          ]}
        >
          {title}
        </Text>
        <Text
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          onTextLayout={handleTitleLayout}
          style={[
            styles.title,
            significanceStyle.title,
            { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
          ]}
        >
          {title}
        </Text>
      </View>
    </View>
  );
}
