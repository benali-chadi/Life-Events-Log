import type { useTheme } from '@lel/design/useTheme';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ImageOff } from 'lucide-react-native';
import { Text, View } from 'react-native';
import type { EventAttachment } from '@/models';
import { resolveAttachmentFile } from '@/data/attachments';
import { eventCardStyles as styles } from './eventCardStyles';

type EventCardAttachmentPreviewProps = {
  attachment: EventAttachment;
  attachmentCount: number;
  prominent?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
};

export default function EventCardAttachmentPreview({
  attachment,
  attachmentCount,
  prominent = false,
  colors,
}: EventCardAttachmentPreviewProps) {
  const file = resolveAttachmentFile(attachment.contentHash);
  const [failedHash, setFailedHash] = useState<string | null>(null);
  const available = file.isAvailable && failedHash !== attachment.contentHash;

  return (
    <View
      accessibilityLabel={`${attachmentCount} ${
        attachmentCount === 1 ? 'attachment' : 'attachments'
      }, previewing ${attachment.filename}${
        available ? '' : ', file unavailable'
      }`}
      style={[
        styles.attachmentPreview,
        {
          backgroundColor: colors.surface,
          borderWidth: 0,
          padding: 0,
          alignSelf: 'flex-start',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 4,
        },
      ]}
    >
      {available ? (
        <Image
          accessibilityLabel={attachment.filename}
          contentFit="cover"
          onError={() => setFailedHash(attachment.contentHash)}
          source={{ uri: file.uri }}
          style={[
            styles.attachmentThumbnail,
            prominent && { width: 180, height: 120 },
            { backgroundColor: colors.interactiveMuted },
          ]}
          transition={150}
        />
      ) : (
        <View
          style={[
            styles.attachmentThumbnail,
            prominent && { width: 180, height: 120 },
            styles.unavailableAttachmentThumbnail,
            { backgroundColor: colors.interactiveMuted },
          ]}
        >
          <ImageOff color={colors.textMuted} size={20} />
        </View>
      )}
      {attachmentCount > 1 && (
        <Text style={[styles.attachmentCount, { color: colors.textMuted }]}>
          +{attachmentCount - 1} more
        </Text>
      )}
    </View>
  );
}
