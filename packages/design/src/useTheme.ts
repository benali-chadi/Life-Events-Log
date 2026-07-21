import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme } from './colors';

export function useTheme() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkTheme : lightTheme;

  return {
    colors,
    isDark: scheme === 'dark',
  };
}
