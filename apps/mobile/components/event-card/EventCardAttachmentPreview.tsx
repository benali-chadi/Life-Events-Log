import type { useTheme } from '@lel/design/useTheme';
import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { Text, View } from 'react-native';
import type { EventAttachment } from '@/models';
import { resolveAttachmentFile } from '@/data/attachments';
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
  const file = resolveAttachmentFile(attachment.relativePath);

  return (
    <View
      accessibilityLabel={`${attachmentCount} ${
        attachmentCount === 1 ? 'attachment' : 'attachments'
      }, previewing ${attachment.filename}${
        file.isAvailable ? '' : ', file unavailable'
      }`}
      style={[
        styles.attachmentPreview,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {file.isAvailable ? (
        <Image
          accessibilityLabel={attachment.filename}
          contentFit="cover"
          source={{ uri: file.uri }}
          style={[
            styles.attachmentThumbnail,
            { backgroundColor: colors.interactiveMuted },
          ]}
          transition={150}
        />
      ) : (
        <View
          style={[
            styles.attachmentThumbnail,
            styles.unavailableAttachmentThumbnail,
            { backgroundColor: colors.interactiveMuted },
          ]}
        >
          <ImageOff color={colors.textMuted} size={20} />
        </View>
      )}
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
