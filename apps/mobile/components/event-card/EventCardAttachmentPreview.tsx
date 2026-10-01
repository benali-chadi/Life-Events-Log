import type { useTheme } from '@lel/design/useTheme';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ImageOff } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import type { EventAttachment } from '@/models';
import { resolveAttachmentFile } from '@/data/attachments';
import { eventCardStyles as styles } from './eventCardStyles';

type Props = {
  attachments: EventAttachment[];
  attachmentCount: number;
  prominent?: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  onOpen: (id: string) => void;
};

export default function EventCardAttachmentPreview({
  attachments,
  attachmentCount,
  prominent = false,
  colors,
  onOpen,
}: Props) {
  const previews = attachments.slice(0, 2);
  const remaining = Math.max(0, attachmentCount - previews.length);
  return (
    <View style={{ gap: 4 }}>
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          maxWidth: prominent ? 300 : 184,
        }}
      >
        {previews.map((attachment) => (
          <Thumbnail
            key={`${attachment.id}:${attachment.contentHash}`}
            attachment={attachment}
            prominent={prominent}
            colors={colors}
            onOpen={onOpen}
          />
        ))}
      </View>
      {remaining > 0 && previews[0] && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View all ${attachmentCount} attachments`}
          onPress={(e) => {
            e.stopPropagation();
            onOpen(previews[0]!.id);
          }}
          style={{
            minHeight: 44,
            justifyContent: 'center',
            alignSelf: 'flex-start',
          }}
        >
          <Text style={[styles.attachmentCount, { color: colors.textMuted }]}>
            +{remaining} more
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function Thumbnail({
  attachment,
  prominent,
  colors,
  onOpen,
}: Pick<Props, 'prominent' | 'colors' | 'onOpen'> & {
  attachment: EventAttachment;
}) {
  const [failed, setFailed] = useState(false);
  const file = resolveAttachmentFile(attachment.contentHash);
  const available = file.isAvailable && !failed;
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={`Open ${attachment.filename}${available ? '' : ', file unavailable'}`}
      onPress={(e) => {
        e.stopPropagation();
        onOpen(attachment.id);
      }}
      style={{
        flexShrink: 1,
        width: prominent ? 146 : 88,
        aspectRatio: 4 / 3,
        borderRadius: 6,
        overflow: 'hidden',
        backgroundColor: colors.interactiveMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {available ? (
        <Image
          source={{ uri: file.uri }}
          contentFit="cover"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <ImageOff color={colors.textMuted} size={20} />
      )}
    </Pressable>
  );
}
