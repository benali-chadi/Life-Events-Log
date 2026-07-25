import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import 'react-native-reanimated';
import EventsHeader from 'components/EventsHeader';
import { useTheme } from '@lel/design/useTheme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import EventDeletionProvider from '@/components/event-deletion/EventDeletionProvider';

// export const unstable_settings = {
//   anchor: '(tabs)',
// };

export default function RootLayout() {
  const { isDark, colors } = useTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <EventDeletionProvider>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.surface,
            },
            headerTintColor: colors.text,
            headerTitleStyle: {
              color: colors.text,
            },
          }}
        >
          <Stack.Screen
            name="index"
            options={{
              title: 'Events',
              headerTitle: () => <EventsHeader />,
            }}
          />
          <Stack.Screen
            name="[eventId]"
            options={{
              title: 'Event',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen name="new" options={{ presentation: 'modal' }} />
        </Stack>

        <StatusBar style={isDark ? 'light' : 'dark'} />
      </EventDeletionProvider>
    </GestureHandlerRootView>
  );
}
