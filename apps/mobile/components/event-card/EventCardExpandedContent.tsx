import type { useTheme } from '@lel/design/useTheme';
import { Text, View } from 'react-native';
import { significanceLabels } from './eventCardSignificance';
import { eventCardStyles as styles } from './eventCardStyles';
import type { EventCardData } from './types';

type EventCardExpandedContentProps = {
  event: EventCardData;
  colors: ReturnType<typeof useTheme>['colors'];
};

export default function EventCardExpandedContent({
  event,
  colors,
}: EventCardExpandedContentProps) {
  return (
    <View style={[styles.expandedContent, { borderTopColor: colors.border }]}>
      {event.categoryName && (
        <DetailRow
          label="Category"
          value={event.categoryName}
          colors={colors}
        />
      )}
      {event.significance && (
        <DetailRow
          label="Significance"
          value={significanceLabels[event.significance]}
          colors={colors}
        />
      )}
      {event.notes && (
        <Text
          numberOfLines={1}
          style={[styles.notes, { color: colors.textSecondary }]}
        >
          {event.notes}
        </Text>
      )}
    </View>
  );
}

type DetailRowProps = {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
};

function DetailRow({ label, value, colors }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
        {label}
      </Text>
      <Text style={[styles.detailValue, { color: colors.textSecondary }]}>
        {value}
      </Text>
    </View>
  );
}
