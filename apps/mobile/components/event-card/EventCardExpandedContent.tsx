import type { useTheme } from '@lel/design/useTheme';
import { Text, View } from 'react-native';
import { significanceLabels } from './eventCardSignificance';
import { eventCardStyles as styles } from './eventCardStyles';
import EventCardAttachmentPreview from './EventCardAttachmentPreview';
import type { EventListItem } from '@/data/repositories';

type EventCardExpandedContentProps = {
  event: EventListItem;
  colors: ReturnType<typeof useTheme>['colors'];
};

export default function EventCardExpandedContent({
  event,
  colors,
}: EventCardExpandedContentProps) {
  return (
    <View style={[styles.expandedContent, { borderTopColor: colors.border }]}>
      {event.category && (
        <DetailRow
          label="Category"
          value={event.category.name}
          colors={colors}
        />
      )}
      <DetailRow
        label="Significance"
        value={significanceLabels[event.event.significance]}
        colors={colors}
      />
      {event.event.notesPreview && (
        <Text
          numberOfLines={1}
          style={[styles.notes, { color: colors.textSecondary }]}
        >
          {event.event.notesPreview}
        </Text>
      )}
      {event.attachmentPreview && (
        <EventCardAttachmentPreview
          attachment={event.attachmentPreview}
          attachmentCount={event.attachmentCount}
          colors={colors}
        />
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
