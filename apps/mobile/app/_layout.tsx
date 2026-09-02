import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { Image, StyleSheet } from 'react-native';
import 'react-native-reanimated';
import { useTheme } from '@lel/design/useTheme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import EventDeletionProvider from '@/components/event-deletion/EventDeletionProvider';
import AppToastProvider from '@/components/ui/AppToastProvider';
import TimelineOverflowMenu from '@/components/TimelineOverflowMenu';
import { createAppRepositories } from '@/data/appRepositories';
import { appQueryClient } from '@/data/query';
import { RepositoryProvider } from '@/data/RepositoryProvider';
import { DATABASE_NAME, initializeDatabase } from '@/data/sqlite/database';

export const unstable_settings = {
  anchor: 'index',
};

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={initializeDatabase}>
      <AppLayout />
    </SQLiteProvider>
  );
}

function AppLayout() {
  const { isDark, colors } = useTheme();
  const sqlite = useSQLiteContext();
  const repositories = useMemo(() => createAppRepositories(sqlite), [sqlite]);

  return (
    <RepositoryProvider repositories={repositories}>
      <QueryClientProvider client={appQueryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AppToastProvider>
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
                    headerTitle: () => (
                      <Image
                        accessibilityLabel="Life Events Log"
                        accessible
                        resizeMode="contain"
                        source={
                          // require('@/assets/images/adaptive-icon-foreground.png')
                          isDark
                            ? require('@/assets/images/logo-lockup-dark.png')
                            : require('@/assets/images/logo-lockup.png')
                        }
                        style={styles.timelineLockup}
                      />
                    ),
                    headerRight: () => <TimelineOverflowMenu />,
                  }}
                />
                <Stack.Screen
                  name="[eventId]"
                  options={{
                    title: 'Event',
                    headerBackTitle: 'Back',
                  }}
                />
                <Stack.Screen
                  name="new"
                  options={{
                    presentation: 'modal',
                    headerShown: false,
                  }}
                />
                <Stack.Screen
                  name="metadata"
                  options={{
                    title: 'Manage metadata',
                    headerBackTitle: 'Back',
                  }}
                />
                <Stack.Screen
                  name="import-ics"
                  options={{
                    title: 'Import calendar',
                    headerBackTitle: 'Back',
                  }}
                />
              </Stack>

              <StatusBar style={isDark ? 'light' : 'dark'} />
            </EventDeletionProvider>
          </AppToastProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </RepositoryProvider>
  );
}

const styles = StyleSheet.create({
  timelineLockup: {
    width: 150,
    height: 50,
  },
});
