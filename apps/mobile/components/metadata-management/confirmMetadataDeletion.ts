import { ActionSheetIOS, Alert, Platform } from 'react-native';
import type { PendingMetadataDeletion } from './MetadataDeletionProvider';

function metadataLabel(kind: PendingMetadataDeletion['kind']) {
  return kind === 'category' ? 'category' : kind;
}

export function confirmMetadataDeletion(
  metadata: PendingMetadataDeletion,
  onConfirm: () => void
) {
  const label = metadataLabel(metadata.kind);
  const usage =
    metadata.eventCount === 0
      ? 'It is not used by any events.'
      : `It will be removed from ${metadata.eventCount} ${
          metadata.eventCount === 1 ? 'event' : 'events'
        }.`;
  const message = `“${metadata.name}” will be permanently deleted. ${usage}`;
  const action = `Delete ${label}`;

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: `Delete ${label}?`,
        message,
        options: ['Cancel', action],
        cancelButtonIndex: 0,
        destructiveButtonIndex: 1,
      },
      (buttonIndex) => {
        if (buttonIndex === 1) onConfirm();
      }
    );
    return;
  }

  Alert.alert(`Delete ${label}?`, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}
