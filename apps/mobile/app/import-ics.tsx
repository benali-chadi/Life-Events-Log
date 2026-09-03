import { spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { File } from 'expo-file-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppToast } from '@/components/ui/AppToastProvider';
import { useLocationsQuery, usePeopleQuery, useTagsQuery } from '@/data/query';
import {
  expandIcsRecurrences,
  IcsImportPreview,
  mapIcsImport,
  parseIcs,
  type IcsImportMappingResult,
} from '@/features/ics';

export default function ImportIcsScreen() {
  const { colors } = useTheme();
  const { showToast } = useAppToast();
  const params = useLocalSearchParams<{ name?: string; uri?: string }>();
  const tags = useTagsQuery();
  const people = usePeopleQuery();
  const locations = useLocationsQuery();
  const [mapping, setMapping] = useState<IcsImportMappingResult | null>(null);
  const preparationStarted = useRef(false);

  useEffect(() => {
    const queryError = tags.error ?? people.error ?? locations.error;
    if (!queryError || preparationStarted.current) return;
    preparationStarted.current = true;
    showToast({
      message:
        queryError instanceof Error
          ? queryError.message
          : 'Existing metadata could not be loaded.',
      kind: 'error',
    });
    router.back();
  }, [locations.error, people.error, showToast, tags.error]);

  useEffect(() => {
    if (
      preparationStarted.current ||
      tags.data === undefined ||
      people.data === undefined ||
      locations.data === undefined
    ) {
      return;
    }
    preparationStarted.current = true;
    let active = true;

    const prepare = async () => {
      try {
        if (!params.uri) throw new Error('No calendar file was selected.');
        const contents = await new File(params.uri).text();
        const parsed = parseIcs(contents);
        const expanded = expandIcsRecurrences(parsed);
        const prepared = mapIcsImport(expanded, {
          tags: tags.data,
          people: people.data,
          locations: locations.data,
        });
        if (active) setMapping(prepared);
      } catch (error) {
        if (!active) return;
        showToast({
          message: importErrorMessage(error, params.name),
          kind: 'error',
        });
        router.back();
      }
    };

    void prepare();
    return () => {
      active = false;
    };
  }, [
    locations.data,
    params.name,
    params.uri,
    people.data,
    showToast,
    tags.data,
  ]);

  if (mapping) {
    return (
      <IcsImportPreview
        mapping={mapping}
        onCancel={() => router.back()}
        onImported={(result) => {
          showToast({
            message: `${result.eventCount.toLocaleString()} event${result.eventCount === 1 ? '' : 's'} imported.`,
          });
          router.back();
        }}
      />
    );
  }

  return (
    <View style={[styles.loading, { backgroundColor: colors.bg }]}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Text style={[styles.loadingTitle, { color: colors.text }]}>
        Preparing import…
      </Text>
      <Text
        numberOfLines={2}
        style={[styles.filename, { color: colors.textMuted }]}
      >
        {params.name ?? 'Calendar file'}
      </Text>
    </View>
  );
}

function importErrorMessage(error: unknown, filename?: string) {
  const reason = error instanceof Error ? error.message : 'Please try again.';
  return filename
    ? `Couldn’t import “${filename}”. ${reason}`
    : `Couldn’t prepare the calendar import. ${reason}`;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
  },
  loadingTitle: { ...typography.h3, marginTop: spacing[4] },
  filename: { ...typography.small, marginTop: spacing[1], textAlign: 'center' },
});
