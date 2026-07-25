import CreationMetadataRow from '@/components/metadata/CreationMetadataRow';
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

export default function NewEventScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [initialDate] = useState(currentDateValue);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<DateValue>(initialDate);
  const [category, setCategory] = useState<SelectOption | null>(null);
  const [people, setPeople] = useState<SelectOption[]>([]);
  const [tags, setTags] = useState<SelectOption[]>([]);
  const [significance, setSignificance] = useState<SelectOption | null>(null);
  const [location, setLocation] = useState<SelectOption | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const canCreate = title.trim().length > 0;
  const hasChanges =
    title.length > 0 ||
    date.date !== initialDate.date ||
    date.time !== initialDate.time ||
    category !== null ||
    people.length > 0 ||
    tags.length > 0 ||
    significance !== null ||
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

  const createEvent = () => {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    setIsCreating(true);
    requestAnimationFrame(() => {
      router.replace({
        pathname: '/[eventId]',
        params: {
          eventId: `${Date.now()}`,
          title: nextTitle,
          date: date.date,
          time: date.time ?? '',
          category: category ? JSON.stringify(category) : '',
          people: JSON.stringify(people),
          tags: JSON.stringify(tags),
          significance: significance ? JSON.stringify(significance) : '',
          location: location ? JSON.stringify(location) : '',
        },
      });
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'New event',
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
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
              onPress={createEvent}
              style={styles.headerButton}
            >
              <Text
                style={[
                  styles.headerButtonText,
                  {
                    color: canCreate ? colors.focus : colors.textMuted,
                    fontWeight: '700',
                  },
                ]}
              >
                Create
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
            maxLength={160}
            onChangeText={setTitle}
            onSubmitEditing={createEvent}
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

          <View style={styles.metadata}>
            <CreationMetadataRow
              label="Date"
              icon={<Calendar color={colors.textMuted} size={16} />}
            >
              <DateMetadata value={date} onChange={setDate} />
            </CreationMetadataRow>
            <CreationMetadataRow
              label="Category"
              icon={<Shapes color={colors.textMuted} size={16} />}
            >
              <CategoryMetadata value={category} onChange={setCategory} />
            </CreationMetadataRow>
            <CreationMetadataRow
              label="People"
              icon={<UsersRound color={colors.textMuted} size={16} />}
            >
              <PeopleMetadata value={people} onChange={setPeople} />
            </CreationMetadataRow>
            <CreationMetadataRow
              label="Tags"
              icon={<Tags color={colors.textMuted} size={16} />}
            >
              <TagsMetadata value={tags} onChange={setTags} />
            </CreationMetadataRow>
            <CreationMetadataRow
              label="Significance"
              icon={<BadgeAlert color={colors.textMuted} size={16} />}
            >
              <SignificanceMetadata
                value={significance}
                onChange={setSignificance}
              />
            </CreationMetadataRow>
            <CreationMetadataRow
              label="Location"
              icon={<MapPin color={colors.textMuted} size={16} />}
            >
              <LocationMetadata value={location} onChange={setLocation} />
            </CreationMetadataRow>
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
