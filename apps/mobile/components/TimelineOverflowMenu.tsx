import { elevation, radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Download, FileUp, MoreVertical, Tags } from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useAppToast } from '@/components/ui/AppToastProvider';

type MenuPosition = {
  top: number;
  right: number;
};

const MENU_WIDTH = 230;

type TimelineOverflowMenuProps = {
  exportDisabled?: boolean;
  onImportSyncPackage?: () => void;
  onExportSyncPackage?: () => void;
  showFilteredExport?: boolean;
  onExportAll?: () => void;
  onExportFiltered?: () => void;
};

export default function TimelineOverflowMenu({
  exportDisabled = false,
  onImportSyncPackage,
  onExportSyncPackage,
  showFilteredExport = false,
  onExportAll,
  onExportFiltered,
}: TimelineOverflowMenuProps) {
  const { colors } = useTheme();
  const { showToast } = useAppToast();
  const { width: windowWidth } = useWindowDimensions();
  const triggerRef = useRef<View>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setMenuPosition({
        top: y + height + spacing[1],
        right: Math.max(spacing[2], windowWidth - x - width),
      });
    });
  };

  const closeMenu = () => setMenuPosition(null);

  const manageMetadata = () => {
    closeMenu();
    requestAnimationFrame(() => router.push('/metadata'));
  };

  const exportEvents = (action: (() => void) | undefined) => {
    closeMenu();
    requestAnimationFrame(() => action?.());
  };

  const importIcs = async () => {
    closeMenu();
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['text/calendar', 'application/ics'],
      });
      if (result.canceled) return;

      const file = result.assets[0];
      if (!file) return;
      router.push({
        pathname: './import-ics',
        params: { name: file.name, uri: file.uri },
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : 'The calendar file could not be opened.',
        kind: 'error',
      });
    }
  };

  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityLabel="Timeline actions"
        accessibilityRole="button"
        accessibilityState={{ expanded: menuPosition !== null }}
        hitSlop={spacing[2]}
        onPress={openMenu}
        style={({ pressed }) => [
          styles.trigger,
          pressed && { backgroundColor: colors.interactivePressed },
        ]}
      >
        <MoreVertical color={colors.textSecondary} size={21} strokeWidth={2} />
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={closeMenu}
        statusBarTranslucent
        transparent
        visible={menuPosition !== null}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel="Close timeline actions"
            accessibilityRole="button"
            onPress={closeMenu}
            style={StyleSheet.absoluteFill}
          />

          {menuPosition && (
            <View
              accessibilityViewIsModal
              style={[
                styles.menu,
                elevation.dropdown,
                menuPosition,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={manageMetadata}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && { backgroundColor: colors.interactivePressed },
                ]}
              >
                <Tags color={colors.textSecondary} size={18} strokeWidth={2} />
                <Text style={[styles.menuItemText, { color: colors.text }]}>
                  Manage metadata
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => void importIcs()}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && { backgroundColor: colors.interactivePressed },
                ]}
              >
                <FileUp
                  color={colors.textSecondary}
                  size={18}
                  strokeWidth={2}
                />
                <Text style={[styles.menuItemText, { color: colors.text }]}>
                  Import from calendar file
                </Text>
              </Pressable>

              {onImportSyncPackage && (
                <Pressable
                  accessibilityRole="button"
                  disabled={exportDisabled}
                  onPress={() => exportEvents(onImportSyncPackage)}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && { backgroundColor: colors.interactivePressed },
                    exportDisabled && styles.disabled,
                  ]}
                >
                  <FileUp
                    color={colors.textSecondary}
                    size={18}
                    strokeWidth={2}
                  />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>
                    Import sync package
                  </Text>
                </Pressable>
              )}
              {onExportAll && (
                <Pressable
                  accessibilityRole="button"
                  disabled={exportDisabled}
                  onPress={() => exportEvents(onExportAll)}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && { backgroundColor: colors.interactivePressed },
                    exportDisabled && styles.disabled,
                  ]}
                >
                  <Download
                    color={colors.textSecondary}
                    size={18}
                    strokeWidth={2}
                  />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>
                    Export all to calendar file
                  </Text>
                </Pressable>
              )}
              {onExportSyncPackage && (
                <Pressable
                  accessibilityRole="button"
                  disabled={exportDisabled}
                  onPress={() => exportEvents(onExportSyncPackage)}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && { backgroundColor: colors.interactivePressed },
                    exportDisabled && styles.disabled,
                  ]}
                >
                  <Download
                    color={colors.textSecondary}
                    size={18}
                    strokeWidth={2}
                  />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>
                    Export sync package
                  </Text>
                </Pressable>
              )}
              {showFilteredExport && onExportFiltered && (
                <Pressable
                  accessibilityRole="button"
                  disabled={exportDisabled}
                  onPress={() => exportEvents(onExportFiltered)}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && { backgroundColor: colors.interactivePressed },
                    exportDisabled && styles.disabled,
                  ]}
                >
                  <Download
                    color={colors.textSecondary}
                    size={18}
                    strokeWidth={2}
                  />
                  <Text style={[styles.menuItemText, { color: colors.text }]}>
                    Export filtered to calendar file
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  modalRoot: { flex: 1 },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: radius.md,
  },
  menuItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  menuItemText: { ...typography.small, fontWeight: '500' },
  disabled: { opacity: 0.5 },
});
