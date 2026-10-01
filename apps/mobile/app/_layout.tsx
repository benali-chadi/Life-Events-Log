import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import React, { useEffect, useMemo } from 'react';
import { Image, StyleSheet } from 'react-native';
import 'react-native-reanimated';
import { useTheme } from '@lel/design/useTheme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import EventDeletionProvider from '@/components/event-deletion/EventDeletionProvider';
import AppToastProvider from '@/components/ui/AppToastProvider';
import { createAppRepositories } from '@/data/appRepositories';
import { appQueryClient } from '@/data/query';
import { RepositoryProvider } from '@/data/RepositoryProvider';
import {
  DATABASE_NAME,
  initializeDatabase,
  createDrizzleDatabase,
} from '@/data/sqlite/database';
import { createAttachmentBlobReferences } from '@/data/sqlite/attachmentBlobReferences';
import { attachmentBlobCleanupStorage } from '@/data/attachments/blobCleanupStorage';
import { createAttachmentStorageAccess } from '@/data/attachments/storageAccess';
import { AttachmentStorageAccessProvider } from '@/data/attachments/AttachmentStorageAccessProvider';
import { createAttachmentBlobCleanupCoordinator } from '@/data/jobs/attachmentBlobCleanup';

import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';

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
  const navigationTheme = useMemo(() => {
    const baseTheme = isDark ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        primary: colors.primary,
      },
    };
  }, [isDark, colors]);
  const sqlite = useSQLiteContext();
  const repositories = useMemo(() => createAppRepositories(sqlite), [sqlite]);
  const storageAccess = useMemo(
    () =>
      createAttachmentStorageAccess(
        createAttachmentBlobCleanupCoordinator({
          references: createAttachmentBlobReferences(
            createDrizzleDatabase(sqlite)
          ),
          storage: attachmentBlobCleanupStorage,
        })
      ),
    [sqlite]
  );
  // SQLiteProvider finishes initialization/migrations before mounting this tree.
  useEffect(() => {
    storageAccess.requestCleanup();
  }, [storageAccess]);
  useDrizzleStudio(sqlite);

  return (
    <AttachmentStorageAccessProvider access={storageAccess}>
      <RepositoryProvider repositories={repositories}>
        <QueryClientProvider client={appQueryClient}>
          <ThemeProvider value={navigationTheme}>
            <GestureHandlerRootView
              style={{ flex: 1, backgroundColor: colors.bg }}
            >
              <AppToastProvider>
                <EventDeletionProvider>
                  <Stack
                    screenOptions={{
                      contentStyle: { backgroundColor: colors.bg },
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
          </ThemeProvider>
        </QueryClientProvider>
      </RepositoryProvider>
    </AttachmentStorageAccessProvider>
  );
}

const styles = StyleSheet.create({
  timelineLockup: {
    width: 150,
    height: 50,
  },
});
