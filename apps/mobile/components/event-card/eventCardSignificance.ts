import type { useTheme } from '@lel/design/useTheme';
import type { EventSignificance } from '@/models';
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
  const styles = {
    ordinary: {
      title: eventCardStyles.ordinaryTitle,
      card: eventCardStyles.ordinaryCard,
    },
    notable: {
      title: eventCardStyles.notableTitle,
      card: eventCardStyles.notableCard,
    },
    major: {
      title: eventCardStyles.majorTitle,
      card: eventCardStyles.majorCard,
    },
    'turning-point': {
      title: eventCardStyles.turningPointTitle,
      card: eventCardStyles.turningPointCard,
    },
  };
  return {
    ...styles[significance],
    borderWidth: 0,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    markerColor: colors.textMuted,
  };
}
