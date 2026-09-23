import { elevation, overlay, radius, spacing } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

type BottomSheetModalProps = PropsWithChildren<{
  closeAccessibilityLabel: string;
  onRequestClose: () => void;
  sheetStyle?: StyleProp<ViewStyle>;
  visible?: boolean;
}>;

export default function BottomSheetModal({
  children,
  closeAccessibilityLabel,
  onRequestClose,
  sheetStyle,
  visible = true,
}: BottomSheetModalProps) {
  const { colors } = useTheme();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onRequestClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.modalRoot}>
        <Pressable
          accessibilityLabel={closeAccessibilityLabel}
          accessibilityRole="button"
          onPress={onRequestClose}
          style={styles.backdrop}
        />

        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            elevation.dropdown,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              shadowColor: colors.shadow,
            },
            sheetStyle,
          ]}
        >
          <View
            style={[styles.handle, { backgroundColor: colors.borderStrong }]}
          />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: overlay.backdrop,
  },
  sheet: {
    width: '100%',
    maxWidth: 560,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  handle: {
    alignSelf: 'center',
    width: spacing[10],
    height: spacing[1],
    marginBottom: spacing[2],
    borderRadius: radius.sm,
  },
});
