import { useTheme } from '@lel/design/useTheme';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
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
import {
  BadgeAlert,
  Calendar,
  MapPin,
  MoreVertical,
  Shapes,
  Tags,
  UsersRound,
} from 'lucide-react-native';
import TagsMetadata from '@/components/metadata/TagsMetadata';
import MetadataRow from '@/components/metadata/MetadataRow';
import PeopleMetadata from '@/components/metadata/PeopleMetadata';
import CategoryMetadata from '@/components/metadata/CategoryMetadata';
import SignificanceMetadata from '@/components/metadata/SignificanceMetadata';
import LocationMetadata from '@/components/metadata/LocationMetadata';
import { radius, spacing, typography } from '@lel/design';
import DateMetadata, {
  currentDateValue,
  type DateValue,
} from '@/components/metadata/DateMetadata';
import { useRef, useState } from 'react';
import EventNotes from '@/components/event-notes/EventNotes';
import EventAttachments from '@/components/event-attachments/EventAttachments';
import type { EventAttachment } from '@/components/event-attachments/types';
import EventTitleHeader from '@/components/event-title/EventTitleHeader';
import type { SelectOption } from '@/components/ui/select';
import { useEventDeletion } from '@/components/event-deletion/EventDeletionProvider';
import { confirmEventDeletion } from '@/components/event-deletion/confirmEventDeletion';

const initialTitle = 'Started working on Life Events Log';

function parseOption(value?: string): SelectOption | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as SelectOption;
  } catch {
    return null;
  }
}

function parseOptions(value?: string): SelectOption[] {
  if (!value) return [];

  try {
    return JSON.parse(value) as SelectOption[];
  } catch {
    return [];
  }
}

const initialNotes = `Started working on the first version today.

The central idea is **a timeline, not a database**.

- Keep capture lightweight
- Make ordinary events worth recording
- Preserve the user's ownership of their data

> The product should feel closer to a personal archive than a social feed.`;

export default function EventScreen() {
  const {
    eventId,
    title: routeTitle,
    date: routeDate,
    time: routeTime,
    category: routeCategory,
    people: routePeople,
    tags: routeTags,
    significance: routeSignificance,
    location: routeLocation,
  } = useLocalSearchParams<{
    eventId?: string;
    title?: string;
    date?: string;
    time?: string;
    category?: string;
    people?: string;
    tags?: string;
    significance?: string;
    location?: string;
  }>();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { deleteEvent } = useEventDeletion();
  const titleInputRef = useRef<TextInput>(null);

  const [eventDate, setEventDate] = useState<DateValue>(() =>
    routeDate
      ? { date: routeDate, time: routeTime || undefined }
      : currentDateValue()
  );
  const [category, setCategory] = useState<SelectOption | null>(() =>
    routeDate ? parseOption(routeCategory) : { id: 'career', label: 'Career' }
  );
  const [people, setPeople] = useState<SelectOption[]>(() =>
    routeDate
      ? parseOptions(routePeople)
      : [
          { id: '1', label: 'Mounir' },
          { id: '3', label: 'Issam' },
        ]
  );
  const [tags, setTags] = useState<SelectOption[]>(() =>
    routeDate
      ? parseOptions(routeTags)
      : [
          { id: '1', label: 'app' },
          { id: '4', label: 'travel' },
        ]
  );
  const [significance, setSignificance] = useState<SelectOption | null>(() =>
    routeDate
      ? parseOption(routeSignificance)
      : { id: 'notable', label: 'Notable' }
  );
  const [location, setLocation] = useState<SelectOption | null>(() =>
    routeDate ? parseOption(routeLocation) : { id: 'Sale', label: 'Sale' }
  );

  const eventTitle =
    typeof routeTitle === 'string' && routeTitle.trim()
      ? routeTitle
      : initialTitle;
  const [title, setTitle] = useState(eventTitle);
  const [draftTitle, setDraftTitle] = useState(eventTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [attachments, setAttachments] = useState<EventAttachment[]>([]);
  const hasUnsavedNotes = notes !== savedNotes;
  const hasUnsavedTitle = isEditingTitle && draftTitle !== title;
  const hasUnsavedChanges = hasUnsavedNotes || hasUnsavedTitle;

  usePreventRemove(hasUnsavedChanges && !isDeleting, ({ data }) => {
    Alert.alert(
      'Discard changes?',
      'Your unsaved changes to this event will be lost.',
      [
        {
          text: 'Stay',
          style: 'cancel',
        },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(data.action),
        },
      ]
    );
  });

  const beginTitleEditing = () => {
    setDraftTitle(title);
    setIsEditingTitle(true);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  };

  const cancelTitleEditing = () => {
    setDraftTitle(title);
    setIsEditingTitle(false);
    titleInputRef.current?.blur();
  };

  const saveTitle = () => {
    const nextTitle = draftTitle.trim();

    if (!nextTitle) {
      Alert.alert('Title required', 'Enter a title for this event.');
      return;
    }

    setTitle(nextTitle);
    setDraftTitle(nextTitle);
    setIsEditingTitle(false);
    titleInputRef.current?.blur();
  };

  const confirmDelete = () => {
    confirmEventDeletion(title, () => {
      setIsDeleting(true);
      deleteEvent(eventId ?? title);
      requestAnimationFrame(() => router.back());
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <EventTitleHeader
              inputRef={titleInputRef}
              isEditing={isEditingTitle}
              onBeginEditing={beginTitleEditing}
              onChange={setDraftTitle}
              onSubmit={saveTitle}
              title={isEditingTitle ? draftTitle : title}
            />
          ),
          headerBackTitle: 'Back',
          headerLeft: isEditingTitle
            ? () => (
                <Pressable
                  accessibilityLabel="Cancel title editing"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={cancelTitleEditing}
                  style={({ pressed }) => [
                    styles.headerTextButton,
                    pressed && {
                      backgroundColor: colors.interactivePressed,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.headerButtonLabel,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Cancel
                  </Text>
                </Pressable>
              )
            : undefined,
          headerRight: isEditingTitle
            ? () => (
                <Pressable
                  accessibilityLabel="Save event title"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={saveTitle}
                  style={({ pressed }) => [
                    styles.headerTextButton,
                    pressed && {
                      backgroundColor: colors.interactivePressed,
                    },
                  ]}
                >
                  <Text
                    style={[styles.doneButtonLabel, { color: colors.primary }]}
                  >
                    Done
                  </Text>
                </Pressable>
              )
            : () => (
                <Pressable
                  accessibilityLabel="Event actions"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={confirmDelete}
                  style={({ pressed }) => [
                    styles.headerMenuButton,
                    pressed && {
                      backgroundColor: colors.interactivePressed,
                    },
                  ]}
                >
                  <MoreVertical
                    color={colors.textSecondary}
                    size={21}
                    strokeWidth={2}
                  />
                </Pressable>
              ),
        }}
      />

      {/* Event content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.root, { backgroundColor: colors.bg }]}
      >
        <ScrollView
          style={{ backgroundColor: colors.bg }}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <MetadataRow
              label="Date"
              icon={
                <Calendar size={14} strokeWidth={2} color={colors.textMuted} />
              }
            >
              <DateMetadata value={eventDate} onChange={setEventDate} />
            </MetadataRow>
            <MetadataRow
              label="Tags"
              icon={<Tags size={14} strokeWidth={2} color={colors.textMuted} />}
            >
              <TagsMetadata value={tags} onChange={setTags} />
            </MetadataRow>
            <MetadataRow
              label="Category"
              icon={
                <Shapes size={14} strokeWidth={2} color={colors.textMuted} />
              }
            >
              <CategoryMetadata value={category} onChange={setCategory} />
            </MetadataRow>
            <MetadataRow
              label="People"
              icon={
                <UsersRound
                  size={14}
                  strokeWidth={2}
                  color={colors.textMuted}
                />
              }
            >
              <PeopleMetadata value={people} onChange={setPeople} />
            </MetadataRow>
            <MetadataRow
              label="Significance"
              icon={
                <BadgeAlert
                  size={14}
                  strokeWidth={2}
                  color={colors.textMuted}
                />
              }
            >
              <SignificanceMetadata
                value={significance}
                onChange={setSignificance}
              />
            </MetadataRow>
            <MetadataRow
              label="Location"
              icon={
                <MapPin size={14} strokeWidth={2} color={colors.textMuted} />
              }
            >
              <LocationMetadata value={location} onChange={setLocation} />
            </MetadataRow>
          </View>

          <View style={styles.contentSection}>
            <EventNotes
              value={notes}
              onChange={setNotes}
              onEditingComplete={() => setSavedNotes(notes)}
            />
          </View>

          <View style={styles.contentSection}>
            <EventAttachments
              attachments={attachments}
              onChange={setAttachments}
            />
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
  scrollContent: {
    flexGrow: 1,
    padding: spacing[2],
    paddingBottom: 160,
  },
  contentSection: {
    marginTop: spacing[6],
  },
  headerTextButton: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.sm,
    paddingHorizontal: spacing[1],
  },
  headerMenuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  headerButtonLabel: {
    ...typography.small,
    fontWeight: '600',
  },
  doneButtonLabel: {
    ...typography.small,
    fontWeight: '700',
  },
});
