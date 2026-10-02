import { useTheme } from '@lel/design/useTheme';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useEventAttachmentsQuery } from '@/data/query';
import { resolveAttachmentFile } from '@/data/attachments';
import AttachmentViewer from '@/components/event-attachments/AttachmentViewer';
import type { UUID } from '@/models';

// This component is mounted only after a thumbnail is opened.
export default function TimelineAttachmentViewer({
  eventId,
  attachmentId,
  onClose,
}: {
  eventId: UUID;
  attachmentId: string;
  onClose: () => void;
}) {
  const query = useEventAttachmentsQuery(eventId);
  const { colors } = useTheme();
  if (!query.isPending && !query.isError && query.data?.length) {
    const attachments = query.data.map((attachment) => {
      const file = resolveAttachmentFile(attachment.contentHash);
      return {
        id: attachment.id,
        uri: file.uri,
        isAvailable: file.isAvailable,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        width: attachment.width,
        height: attachment.height,
      };
    });
    return (
      <AttachmentViewer
        attachments={attachments}
        initialIndex={Math.max(
          0,
          attachments.findIndex((item) => item.id === attachmentId)
        )}
        visible
        onClose={onClose}
      />
    );
  }
  return (
    <Modal visible transparent onRequestClose={onClose} animationType="fade">
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: 24,
          backgroundColor: colors.bg,
        }}
      >
        {query.isPending ? (
          <ActivityIndicator
            accessibilityLabel="Loading attachments"
            color={colors.text}
          />
        ) : (
          <Text style={{ color: colors.text }}>
            {query.isError
              ? 'Couldn’t load attachments.'
              : 'These attachments are no longer available.'}
          </Text>
        )}
        {query.isError && (
          <Pressable
            accessibilityRole="button"
            onPress={() => void query.refetch()}
            style={{ paddingVertical: 16 }}
          >
            <Text style={{ color: colors.text }}>Retry</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{ paddingVertical: 16 }}
        >
          <Text style={{ color: colors.text }}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
