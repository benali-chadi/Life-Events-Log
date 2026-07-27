import type { useTheme } from '@lel/design/useTheme';
import type { EventSignificance } from './types';
import { eventCardStyles } from './eventCardStyles';

type ThemeColors = ReturnType<typeof useTheme>['colors'];

export const significanceLabels: Record<EventSignificance, string> = {
  ordinary: 'Ordinary',
  notable: 'Notable',
  major: 'Major',
  'turning-point': 'Turning point',
};

export const significanceLevels: Record<EventSignificance, number> = {
  ordinary: 1,
  notable: 2,
  major: 3,
  'turning-point': 4,
};

export function getSignificanceStyle(
  significance: EventSignificance,
  colors: ThemeColors
) {
  switch (significance) {
    case 'notable':
      return {
        title: eventCardStyles.notableTitle,
        card: eventCardStyles.notableCard,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        markerColor: colors.textMuted,
      };
    case 'major':
      return {
        title: eventCardStyles.majorTitle,
        card: eventCardStyles.majorCard,
        borderWidth: 1,
        borderColor: colors.textMuted,
        backgroundColor: colors.surfaceElevated,
        markerColor: colors.textSecondary,
      };
    case 'turning-point':
      return {
        title: eventCardStyles.turningPointTitle,
        card: eventCardStyles.turningPointCard,
        borderWidth: 2,
        borderColor: colors.textSecondary,
        backgroundColor: colors.interactiveMuted,
        markerColor: colors.textSecondary,
      };
    default:
      return {
        title: eventCardStyles.ordinaryTitle,
        card: eventCardStyles.ordinaryCard,
        borderWidth: 0,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        markerColor: colors.textMuted,
      };
  }
}
