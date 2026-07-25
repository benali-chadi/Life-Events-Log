import { ActionSheetIOS, Alert, Platform } from 'react-native';

export function confirmEventDeletion(title: string, onConfirm: () => void) {
  const message = `“${title}” will be removed from your timeline.`;

  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Delete event?',
        message,
        options: ['Cancel', 'Delete event'],
        cancelButtonIndex: 0,
        destructiveButtonIndex: 1,
      },
      (buttonIndex) => {
        if (buttonIndex === 1) onConfirm();
      }
    );
    return;
  }

  Alert.alert('Delete event?', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete event', style: 'destructive', onPress: onConfirm },
  ]);
}
