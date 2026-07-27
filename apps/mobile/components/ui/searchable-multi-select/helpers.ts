import {
  radius,
  spacing,
  typography,
  controlSize,
  elevation,
  overlay,
  type ColorsTheme,
} from '@lel/design';
import { StyleSheet } from 'react-native';

export function createStyles(colors: ColorsTheme) {
  return StyleSheet.create({
    trigger: {
      height: controlSize.sm,
      paddingHorizontal: spacing[3],
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing[2],
    },
    triggerActive: {
      borderColor: colors.borderStrong,
      backgroundColor: colors.interactiveMuted,
    },
    triggerPressed: { backgroundColor: colors.interactivePressed },
    triggerContent: {
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[2],
    },
    triggerLabel: {
      ...typography.small,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    triggerLabelActive: { color: colors.text, fontWeight: '500' },

    selectionCount: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: spacing[1],
      borderRadius: radius.sm,
      backgroundColor: colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectionCountText: { ...typography.caption, color: colors.textSecondary },

    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: overlay.backdrop,
      height: '200%',
    },
    sheet: {
      maxHeight: '82%',
      minHeight: 420,
      paddingTop: spacing[2],
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      ...elevation.dropdown,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: spacing[10],
      height: spacing[1],
      marginBottom: spacing[2],
      borderRadius: radius.sm,
      backgroundColor: colors.borderStrong,
    },

    header: {
      paddingHorizontal: spacing[4],
      paddingTop: spacing[2],
      paddingBottom: spacing[3],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing[3],
    },
    headerText: { flex: 1 },
    title: { ...typography.h3, color: colors.text },
    subtitle: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: spacing[1],
    },

    iconButton: {
      width: controlSize.sm,
      height: controlSize.sm,
      borderRadius: radius.md,
      backgroundColor: colors.interactiveMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonPressed: { backgroundColor: colors.interactivePressed },

    listContent: { paddingHorizontal: spacing[3], paddingBottom: spacing[3] },
    emptyListContent: { flexGrow: 1, justifyContent: 'center' },

    option: {
      minHeight: controlSize.lg,
      paddingHorizontal: spacing[3],
      paddingVertical: spacing[2],
      borderRadius: radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing[3],
    },
    optionSelected: { backgroundColor: colors.interactiveMuted },
    optionPressed: { backgroundColor: colors.interactivePressed },
    optionMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing[3],
    },

    colorIndicator: {
      width: spacing[2],
      height: spacing[6],
      borderRadius: radius.sm,
    },
    optionText: { flex: 1 },
    optionLabel: { ...typography.small, color: colors.text },
    optionLabelSelected: { fontWeight: '500' },
    optionDescription: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: spacing[1],
    },

    checkIndicator: {
      width: spacing[6],
      height: spacing[6],
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkIndicatorSelected: {
      borderColor: colors.focus,
      backgroundColor: colors.surface,
    },

    optionSeparator: { height: spacing[1] },

    emptyState: {
      padding: spacing[6],
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing[2],
    },
    emptyText: {
      ...typography.small,
      color: colors.textMuted,
      textAlign: 'center',
    },

    footer: {
      paddingHorizontal: spacing[4],
      paddingTop: spacing[3],
      paddingBottom: spacing[3],
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surfaceElevated,
      flexDirection: 'row',
      gap: spacing[3],
    },

    secondaryButton: {
      height: controlSize.md,
      paddingHorizontal: spacing[4],
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryButtonPressed: { backgroundColor: colors.interactivePressed },
    secondaryButtonDisabled: {
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    secondaryButtonText: {
      ...typography.small,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    secondaryButtonTextDisabled: { color: colors.textMuted },

    primaryButton: {
      flex: 1,
      height: controlSize.md,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonPressed: { backgroundColor: colors.primaryPressed },
    primaryButtonText: {
      ...typography.small,
      color: colors.onPrimary,
      fontWeight: '500',
    },
  });
}
