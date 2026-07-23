import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AttachmentCarousel from './AttachmentCarousel';
import AttachmentViewer from './AttachmentViewer';
import type { EventAttachment } from './types';

type EventAttachmentsProps = {
  attachments: EventAttachment[];
  onChange: (attachments: EventAttachment[]) => void;
};

export default function EventAttachments({
  attachments,
  onChange,
}: EventAttachmentsProps) {
  const { colors } = useTheme();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

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

    const addedAttachments = result.assets.map((asset, index) => ({
      id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
      uri: asset.uri,
      filename: asset.fileName ?? `image-${attachments.length + index + 1}`,
    }));

    onChange([...attachments, ...addedAttachments]);
  };

  const confirmRemove = (attachment: EventAttachment) => {
    Alert.alert(
      'Remove attachment?',
      `${attachment.filename} will be removed from this event.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            onChange(
              attachments.filter((candidate) => candidate.id !== attachment.id)
            ),
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

        <Pressable
          accessibilityLabel="Add attachments"
          accessibilityRole="button"
          onPress={addAttachments}
          style={({ pressed }) => [
            styles.addButton,
            pressed && { backgroundColor: colors.interactivePressed },
          ]}
        >
          <ImagePlus color={colors.textSecondary} size={17} strokeWidth={2} />
          <Text style={[styles.addButtonText, { color: colors.textSecondary }]}>
            Add
          </Text>
        </Pressable>
      </View>

      {attachments.length > 0 ? (
        <AttachmentCarousel
          attachments={attachments}
          onOpen={setViewerIndex}
          onRemove={confirmRemove}
        />
      ) : (
        <Pressable
          accessibilityLabel="Add an attachment"
          accessibilityRole="button"
          onPress={addAttachments}
          style={({ pressed }) => [
            styles.emptyState,
            { borderColor: colors.border },
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
  addButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.sm,
    paddingHorizontal: spacing[2],
  },
  addButtonText: {
    ...typography.small,
    fontWeight: '600',
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
