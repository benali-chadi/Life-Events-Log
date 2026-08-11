import {
  radius,
  spacing,
  typography,
  controlSize,
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
    triggerDisabled: { opacity: 0.55 },
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

    sheet: {
      maxHeight: '82%',
      minHeight: 420,
      paddingTop: spacing[2],
    },

    header: {
      paddingHorizontal: spacing[4],
      paddingTop: spacing[2],
      paddingBottom: spacing[3],
      flexDirection: 'row',
      alignItems: 'center',
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

    matchModeRow: {
      paddingHorizontal: spacing[4],
      paddingVertical: spacing[3],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing[3],
    },
    matchModeText: { flex: 1 },
    matchModeLabel: { ...typography.small, color: colors.text },
    matchModeDescription: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: spacing[1],
    },
    matchModeControl: {
      flexDirection: 'row',
      padding: 2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    matchModeOption: {
      minWidth: 46,
      height: controlSize.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
    },
    matchModeOptionSelected: { backgroundColor: colors.interactiveMuted },
    matchModeOptionPressed: { backgroundColor: colors.interactivePressed },
    matchModeOptionText: {
      ...typography.caption,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    matchModeOptionTextSelected: { color: colors.text },

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
    optionContent: {
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
