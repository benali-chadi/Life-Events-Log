import type { useTheme } from '@lel/design/useTheme';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useEventQuery } from '@/data/query';
import { getAllowedLink } from '@/components/event-notes/linkValidation';
import { useAppToast } from '@/components/ui/AppToastProvider';
import type { EventListItem } from '@/data/repositories';
import { eventCardStyles as styles } from './eventCardStyles';

type EventCardExpandedContentProps = {
  event: EventListItem;
  colors: ReturnType<typeof useTheme>['colors'];
};

// Mount only while expanded: the paginated list retains its lightweight excerpt.
export default function EventCardExpandedContent({
  event,
  colors,
}: EventCardExpandedContentProps) {
  if (!event.event.notesPreview) return null;
  return <FullNotes event={event} colors={colors} />;
}

function FullNotes({ event, colors }: EventCardExpandedContentProps) {
  const query = useEventQuery(event.event.id);
  const { showToast } = useAppToast();
  if (query.isPending)
    return (
      <ActivityIndicator
        accessibilityLabel="Loading notes"
        color={colors.textMuted}
      />
    );
  if (query.isError)
    return (
      <Pressable
        accessibilityRole="button"
        onPress={(e) => {
          e.stopPropagation();
          void query.refetch();
        }}
      >
        <Text style={{ color: colors.textSecondary }}>
          Couldn’t load notes. Tap to retry.
        </Text>
      </Pressable>
    );
  if (!query.data)
    return (
      <Text style={{ color: colors.textMuted }}>
        Notes are no longer available.
      </Text>
    );
  return (
    <View style={styles.notes}>
      <Markdown
        onLinkPress={(value) => {
          const link = getAllowedLink(value);
          if (link)
            void Linking.openURL(link).catch(() =>
              showToast({
                message: 'This link could not be opened.',
                kind: 'error',
              })
            );
          else
            showToast({
              message: 'Links must use http, https, or mailto.',
              kind: 'error',
            });
          return false;
        }}
        style={{
          body: { color: colors.textSecondary, fontSize: 14, lineHeight: 23 },
          paragraph: { marginTop: 0, marginBottom: 12 },
        }}
        rules={{
          image: (node) => (
            <Text key={node.key} style={{ color: colors.textMuted }}>
              [{node.attributes.alt || 'Image'}]
            </Text>
          ),
        }}
      >
        {query.data.notes}
      </Markdown>
    </View>
  );
}
