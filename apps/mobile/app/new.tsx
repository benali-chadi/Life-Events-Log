import MetadataRow from '@/components/metadata/MetadataRow';
import CategoryMetadata from '@/components/metadata/CategoryMetadata';
import DateMetadata, {
  currentDateValue,
  type DateValue,
} from '@/components/metadata/DateMetadata';
import LocationMetadata from '@/components/metadata/LocationMetadata';
import PeopleMetadata from '@/components/metadata/PeopleMetadata';
import SignificanceMetadata from '@/components/metadata/SignificanceMetadata';
import TagsMetadata from '@/components/metadata/TagsMetadata';
import type { SelectOption } from '@/components/ui/select';
import { useCreateEventMutation } from '@/data/query';
import {
  EVENT_TITLE_MAX_LENGTH,
  type EventSignificance,
  type LocalDate,
  type LocalTime,
} from '@/models';
import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { router, Stack } from 'expo-router';
import {
  BadgeAlert,
  Calendar,
  MapPin,
  Shapes,
  Tags,
  UsersRound,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const DEFAULT_SIGNIFICANCE: SelectOption = {
  id: 'ordinary',
  label: 'Ordinary',
};

export default function NewEventScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [initialDate] = useState(currentDateValue);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<DateValue>(initialDate);
  const [category, setCategory] = useState<SelectOption | null>(null);
  const [people, setPeople] = useState<SelectOption[]>([]);
  const [tags, setTags] = useState<SelectOption[]>([]);
  const [significance, setSignificance] = useState<SelectOption | null>(
    DEFAULT_SIGNIFICANCE
  );
  const [location, setLocation] = useState<SelectOption | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const createEventMutation = useCreateEventMutation();

  const canCreate = title.trim().length > 0 && !isCreating;
  const hasChanges =
    title.length > 0 ||
    date.date !== initialDate.date ||
    date.time !== initialDate.time ||
    category !== null ||
    people.length > 0 ||
    tags.length > 0 ||
    significance?.id !== DEFAULT_SIGNIFICANCE.id ||
    location !== null;

  usePreventRemove(hasChanges && !isCreating, ({ data }) => {
    Alert.alert(
      'Discard new event?',
      'The information you entered will be lost.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(data.action),
        },
      ]
    );
  });

  const createEvent = async () => {
    const nextTitle = title.trim();
    if (!nextTitle || isCreating) return;

    setIsCreating(true);

    try {
      await createEventMutation.mutateAsync({
        title: nextTitle,
        date: date.date as LocalDate,
        time: (date.time as LocalTime | undefined) ?? null,
        significance: (significance?.id ??
          DEFAULT_SIGNIFICANCE.id) as EventSignificance,
        categoryId: category?.id ?? null,
        locationId: location?.id ?? null,
        notes: '',
        tagIds: tags.map((tag) => tag.id),
        peopleIds: people.map((person) => person.id),
      });

      router.replace({
        pathname: '/',
      });
    } catch (error) {
      setIsCreating(false);
      Alert.alert(
        'Couldn’t create event',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Create event',
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isCreating }}
              disabled={isCreating}
              onPress={() => router.back()}
              style={styles.headerButton}
            >
              <Text style={[styles.headerButtonText, { color: colors.text }]}>
                Cancel
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canCreate }}
              disabled={!canCreate}
              onPress={() => void createEvent()}
              style={styles.headerButton}
            >
              <Text
                style={[
                  styles.headerButtonText,
                  {
                    color: canCreate ? colors.primary : colors.textMuted,
                    fontWeight: '700',
                  },
                ]}
              >
                {isCreating ? 'Creating…' : 'Create'}
              </Text>
            </Pressable>
          ),
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.root, { backgroundColor: colors.bg }]}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.prompt, { color: colors.text }]}>
            What happened?
          </Text>
          <TextInput
            accessibilityLabel="Event title"
            autoFocus
            editable={!isCreating}
            maxLength={EVENT_TITLE_MAX_LENGTH}
            onChangeText={setTitle}
            onSubmitEditing={() => void createEvent()}
            placeholder="Event title"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            selectionColor={colors.focus}
            style={[
              styles.titleInput,
              {
                color: colors.text,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            value={title}
          />
          {title.length >= 80 && (
            <Text style={[styles.titleCounter, { color: colors.textMuted }]}>
              {title.length}/{EVENT_TITLE_MAX_LENGTH}
            </Text>
          )}

          <View style={styles.metadata}>
            <MetadataRow
              label="Date"
              icon={<Calendar color={colors.textMuted} size={16} />}
            >
              <DateMetadata value={date} onChange={setDate} />
            </MetadataRow>
            <MetadataRow
              label="Category"
              icon={<Shapes color={colors.textMuted} size={16} />}
            >
              <CategoryMetadata value={category} onChange={setCategory} />
            </MetadataRow>
            <MetadataRow
              label="People"
              icon={<UsersRound color={colors.textMuted} size={16} />}
            >
              <PeopleMetadata value={people} onChange={setPeople} />
            </MetadataRow>
            <MetadataRow
              label="Tags"
              icon={<Tags color={colors.textMuted} size={16} />}
            >
              <TagsMetadata value={tags} onChange={setTags} />
            </MetadataRow>
            <MetadataRow
              label="Significance"
              icon={<BadgeAlert color={colors.textMuted} size={16} />}
            >
              <SignificanceMetadata
                value={significance}
                onChange={setSignificance}
              />
            </MetadataRow>
            <MetadataRow
              label="Location"
              icon={<MapPin color={colors.textMuted} size={16} />}
            >
              <LocationMetadata value={location} onChange={setLocation} />
            </MetadataRow>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: spacing[4],
    paddingBottom: spacing[10],
  },
  prompt: {
    ...typography.h3,
    marginBottom: spacing[2],
  },
  titleInput: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    ...typography.body,
  },
  titleCounter: {
    ...typography.small,
    alignSelf: 'flex-end',
    marginTop: spacing[1],
  },
  metadata: {
    marginTop: spacing[5],
  },
  headerButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing[1],
  },
  headerButtonText: {
    ...typography.small,
    fontWeight: '600',
  },
});
