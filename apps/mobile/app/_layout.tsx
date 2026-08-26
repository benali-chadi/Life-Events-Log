import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import 'react-native-reanimated';
import { useTheme } from '@lel/design/useTheme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import EventDeletionProvider from '@/components/event-deletion/EventDeletionProvider';
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
                  title: 'Life Events Log',
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
            </Stack>

            <StatusBar style={isDark ? 'light' : 'dark'} />
          </EventDeletionProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </RepositoryProvider>
  );
}
