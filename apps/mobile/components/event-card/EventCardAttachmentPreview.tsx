import type { useTheme } from '@lel/design/useTheme';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import type { EventAttachment } from '@/models';
import { eventCardStyles as styles } from './eventCardStyles';

type EventCardAttachmentPreviewProps = {
  attachment: EventAttachment;
  attachmentCount: number;
  colors: ReturnType<typeof useTheme>['colors'];
};

export default function EventCardAttachmentPreview({
  attachment,
  attachmentCount,
  colors,
}: EventCardAttachmentPreviewProps) {
  return (
    <View
      accessibilityLabel={`${attachmentCount} ${
        attachmentCount === 1 ? 'attachment' : 'attachments'
      }, previewing ${attachment.filename}`}
      style={[
        styles.attachmentPreview,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <Image
        accessibilityLabel={attachment.filename}
        contentFit="cover"
        source={{ uri: attachment.relativePath }}
        style={[
          styles.attachmentThumbnail,
          { backgroundColor: colors.interactiveMuted },
        ]}
        transition={150}
      />
      <View style={styles.attachmentSummary}>
        <Text
          numberOfLines={1}
          style={[styles.attachmentFilename, { color: colors.textSecondary }]}
        >
          {attachment.filename}
        </Text>
        <Text style={[styles.attachmentCount, { color: colors.textMuted }]}>
          {attachmentCount}{' '}
          {attachmentCount === 1 ? 'attachment' : 'attachments'}
        </Text>
      </View>
    </View>
  );
}
