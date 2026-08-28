import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import * as ImagePicker from 'expo-image-picker';
import { Check, ImagePlus, ListRestart, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AttachmentCarousel from './AttachmentCarousel';
import AttachmentReorderCarousel from './AttachmentReorderCarousel';
import AttachmentViewer from './AttachmentViewer';
import type { AttachmentDraft, AttachmentPreview } from './types';

type EventAttachmentsProps = {
  attachments: AttachmentPreview[];
  draftMode?: boolean;
  onAdd: (attachments: AttachmentDraft[]) => Promise<void>;
  onRemove: (attachment: AttachmentPreview) => Promise<void>;
  onReorder: (attachmentIds: string[]) => Promise<void>;
};

export default function EventAttachments({
  attachments,
  draftMode = false,
  onAdd,
  onRemove,
  onReorder,
}: EventAttachmentsProps) {
  const { colors } = useTheme();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [draftOrder, setDraftOrder] = useState<AttachmentPreview[]>([]);

  const beginReordering = () => {
    setDraftOrder([...attachments]);
    setIsReordering(true);
  };

  const cancelReordering = () => {
    setDraftOrder([]);
    setIsReordering(false);
  };

  const saveOrder = async () => {
    const attachmentIds = draftOrder.map((attachment) => attachment.id);
    const unchanged = attachmentIds.every(
      (id, index) => id === attachments[index]?.id
    );

    if (unchanged) {
      cancelReordering();
      return;
    }

    setIsSavingOrder(true);
    try {
      await onReorder(attachmentIds);
      cancelReordering();
    } catch {
      Alert.alert(
        'Couldn’t save attachment order',
        'Your new order is still here. Please try saving it again.'
      );
    } finally {
      setIsSavingOrder(false);
    }
  };

  const addAttachments = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow access to your photo library to add attachments.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 1,
    });

    if (result.canceled) return;

    const addedAttachments: AttachmentDraft[] = result.assets.map((asset) => ({
      uri: asset.uri,
      filename: asset.fileName ?? `image-${asset.assetId ?? 'attachment'}`,
      mimeType: asset.mimeType ?? null,
      width: asset.width || null,
      height: asset.height || null,
      fileSize: asset.fileSize ?? null,
    }));

    setIsAdding(true);

    try {
      await onAdd(addedAttachments);
    } catch {
      Alert.alert(
        'Couldn’t add attachments',
        'One or more attachments could not be added.'
      );
    } finally {
      setIsAdding(false);
    }
  };

  const confirmRemove = (attachment: AttachmentPreview) => {
    Alert.alert(
      'Remove attachment?',
      draftMode
        ? `${attachment.filename} will be removed from this draft.`
        : `${attachment.filename} will be removed from this event.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void onRemove(attachment).catch(() => {
              Alert.alert(
                'Couldn’t remove attachment',
                'The attachment was not removed. Please try again.'
              );
            });
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[styles.heading, { color: colors.text }]}>
          Attachments
          {attachments.length > 0 ? ` (${attachments.length})` : ''}
        </Text>

        <View style={styles.headerActions}>
          {isReordering ? (
            <>
              <Pressable
                accessibilityLabel="Cancel attachment reordering"
                accessibilityRole="button"
                disabled={isSavingOrder}
                onPress={cancelReordering}
                style={({ pressed }) => [
                  styles.actionButton,
                  isSavingOrder && styles.disabled,
                  pressed && { backgroundColor: colors.interactivePressed },
                ]}
              >
                <X color={colors.textSecondary} size={17} strokeWidth={2} />
                <Text
                  style={[styles.actionText, { color: colors.textSecondary }]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Save attachment order"
                accessibilityRole="button"
                disabled={isSavingOrder}
                onPress={() => void saveOrder()}
                style={({ pressed }) => [
                  styles.actionButton,
                  isSavingOrder && styles.disabled,
                  pressed && { backgroundColor: colors.interactivePressed },
                ]}
              >
                <Check color={colors.primary} size={17} strokeWidth={2.25} />
                <Text style={[styles.actionText, { color: colors.primary }]}>
                  {isSavingOrder ? 'Saving…' : 'Done'}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {attachments.length > 1 && (
                <Pressable
                  accessibilityLabel="Reorder attachments"
                  accessibilityRole="button"
                  onPress={beginReordering}
                  style={({ pressed }) => [
                    styles.actionButton,
                    pressed && { backgroundColor: colors.interactivePressed },
                  ]}
                >
                  <ListRestart
                    color={colors.textSecondary}
                    size={17}
                    strokeWidth={2}
                  />
                  <Text
                    style={[styles.actionText, { color: colors.textSecondary }]}
                  >
                    Reorder
                  </Text>
                </Pressable>
              )}
              <Pressable
                accessibilityLabel="Add attachments"
                accessibilityRole="button"
                disabled={isAdding}
                onPress={() => void addAttachments()}
                style={({ pressed }) => [
                  styles.actionButton,
                  isAdding && styles.disabled,
                  pressed && { backgroundColor: colors.interactivePressed },
                ]}
              >
                <ImagePlus
                  color={colors.textSecondary}
                  size={17}
                  strokeWidth={2}
                />
                <Text
                  style={[styles.actionText, { color: colors.textSecondary }]}
                >
                  {isAdding ? 'Adding…' : 'Add'}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {isReordering ? (
        <AttachmentReorderCarousel
          attachments={draftOrder}
          onOrderChange={setDraftOrder}
        />
      ) : attachments.length > 0 ? (
        <AttachmentCarousel
          attachments={attachments}
          onOpen={setViewerIndex}
          onRemove={confirmRemove}
        />
      ) : (
        <Pressable
          accessibilityLabel="Add an attachment"
          accessibilityRole="button"
          disabled={isAdding}
          onPress={() => void addAttachments()}
          style={({ pressed }) => [
            styles.emptyState,
            { borderColor: colors.border },
            isAdding && styles.disabled,
            pressed && { backgroundColor: colors.interactiveMuted },
          ]}
        >
          <ImagePlus color={colors.textMuted} size={22} strokeWidth={1.75} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            Add photos to this event
          </Text>
        </Pressable>
      )}

      <AttachmentViewer
        attachments={attachments}
        initialIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
        visible={viewerIndex !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing[2],
  },
  header: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    ...typography.h3,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  actionButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.sm,
    paddingHorizontal: spacing[2],
  },
  actionText: {
    ...typography.small,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.55,
  },
  emptyState: {
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
  },
  emptyText: {
    ...typography.small,
  },
});
