import { useTheme } from '@lel/design/useTheme';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import {
  ActivityIndicator,
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
  type DateValue,
} from '@/components/metadata/DateMetadata';
import { useRef, useState } from 'react';
import EventNotes from '@/components/event-notes/EventNotes';
import EventAttachments from '@/components/event-attachments/EventAttachments';
import type { AttachmentPreview } from '@/components/event-attachments/types';
import EventTitleHeader from '@/components/event-title/EventTitleHeader';
import type { SelectOption } from '@/components/ui/select';
import { useEventDeletion } from '@/components/event-deletion/EventDeletionProvider';
import { confirmEventDeletion } from '@/components/event-deletion/confirmEventDeletion';
import { useEventDetailsQuery, useUpdateEventMutation } from '@/data/query';
import type { UpdateEventInput } from '@/data/repositories';
import type {
  EventDetails,
  EventSignificance,
  LocalDate,
  LocalTime,
} from '@/models';
import type { Dispatch, SetStateAction } from 'react';

type ImmediateEventField =
  'date' | 'category' | 'people' | 'tags' | 'significance' | 'location';

function metadataOption(
  value: { id: string; name: string } | null
): SelectOption | null {
  return value ? { id: value.id, label: value.name } : null;
}

function significanceOption(value: string): SelectOption {
  return {
    id: value,
    label:
      value === 'turning-point'
        ? 'Turning point'
        : `${value[0]?.toUpperCase()}${value.slice(1)}`,
  };
}

export default function EventScreen() {
  const params = useLocalSearchParams<{ eventId?: string }>();
  const eventId = typeof params.eventId === 'string' ? params.eventId : '';
  const eventQuery = useEventDetailsQuery(eventId);

  if (eventQuery.isPending) {
    return <EventReadState state="loading" />;
  }

  if (eventQuery.isError) {
    return (
      <EventReadState state="error" onRetry={() => void eventQuery.refetch()} />
    );
  }

  if (!eventQuery.data) {
    return <EventReadState state="not-found" />;
  }

  return <LoadedEventScreen details={eventQuery.data} />;
}

function EventReadState({
  state,
  onRetry,
}: {
  state: 'loading' | 'error' | 'not-found';
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  const isLoading = state === 'loading';

  return (
    <>
      <Stack.Screen options={{ title: 'Event', headerTitle: 'Event' }} />
      <View style={[styles.readState, { backgroundColor: colors.bg }]}>
        {isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Text style={[styles.readStateTitle, { color: colors.text }]}>
              {state === 'error' ? 'Couldn’t load event' : 'Event not found'}
            </Text>
            <Text
              style={[styles.readStateMessage, { color: colors.textSecondary }]}
            >
              {state === 'error'
                ? 'Something went wrong while reading this event.'
                : 'This event may have been deleted or no longer exists.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={state === 'error' ? onRetry : () => router.back()}
              style={({ pressed }) => [
                styles.readStateButton,
                {
                  backgroundColor: pressed
                    ? colors.primaryPressed
                    : colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.readStateButtonText,
                  { color: colors.onPrimary },
                ]}
              >
                {state === 'error' ? 'Try again' : 'Go back'}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </>
  );
}

function LoadedEventScreen({ details }: { details: EventDetails }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { deleteEvent } = useEventDeletion();
  const updateEvent = useUpdateEventMutation();
  const titleInputRef = useRef<TextInput>(null);
  const immediateSaveVersions = useRef<Record<ImmediateEventField, number>>({
    date: 0,
    category: 0,
    people: 0,
    tags: 0,
    significance: 0,
    location: 0,
  });
  const { event } = details;

  const [eventDate, setEventDate] = useState<DateValue>(() => ({
    date: event.date,
    ...(event.time ? { time: event.time } : {}),
  }));
  const [category, setCategory] = useState<SelectOption | null>(() =>
    metadataOption(details.category)
  );
  const [people, setPeople] = useState<SelectOption[]>(() =>
    details.people.map((person) => ({ id: person.id, label: person.name }))
  );
  const [tags, setTags] = useState<SelectOption[]>(() =>
    details.tags.map((tag) => ({ id: tag.id, label: tag.name }))
  );
  const [significance, setSignificance] = useState<SelectOption | null>(() =>
    significanceOption(event.significance)
  );
  const [location, setLocation] = useState<SelectOption | null>(() =>
    metadataOption(details.location)
  );
  const [title, setTitle] = useState(event.title);
  const [draftTitle, setDraftTitle] = useState(event.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [committedNotes, setCommittedNotes] = useState(event.notes);
  const [draftNotes, setDraftNotes] = useState(event.notes);
  const [attachments, setAttachments] = useState<AttachmentPreview[]>(() =>
    details.attachments.map((attachment) => ({
      id: attachment.id,
      uri: attachment.relativePath,
      filename: attachment.filename,
    }))
  );
  const hasUnsavedNotes = draftNotes !== committedNotes;
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

  const showSaveError = () => {
    Alert.alert(
      'Couldn’t save changes',
      'Your changes were not saved. Please try again.'
    );
  };

  const saveTitle = async () => {
    const nextTitle = draftTitle.trim();

    if (!nextTitle || isSavingTitle) {
      if (isSavingTitle) return;

      Alert.alert('Title required', 'Enter a title for this event.');
      return;
    }

    setIsSavingTitle(true);

    try {
      const updated = await updateEvent.mutateAsync({
        id: event.id,
        input: { title: nextTitle },
      });
      const savedTitle = updated.event.title;

      setTitle(savedTitle);
      setDraftTitle(savedTitle);
      setIsEditingTitle(false);
      titleInputRef.current?.blur();
    } catch {
      showSaveError();
    } finally {
      setIsSavingTitle(false);
    }
  };

  const saveNotes = async () => {
    try {
      const updated = await updateEvent.mutateAsync({
        id: event.id,
        input: { notes: draftNotes },
      });

      setCommittedNotes(updated.event.notes);
      setDraftNotes(updated.event.notes);
      return true;
    } catch {
      showSaveError();
      return false;
    }
  };

  const saveImmediate = async <T,>(
    field: ImmediateEventField,
    nextValue: T,
    previousValue: T,
    setValue: Dispatch<SetStateAction<T>>,
    input: UpdateEventInput
  ) => {
    const version = ++immediateSaveVersions.current[field];

    setValue(nextValue);

    try {
      await updateEvent.mutateAsync({ id: event.id, input });
    } catch {
      if (immediateSaveVersions.current[field] === version) {
        setValue(previousValue);
        showSaveError();
      }
    }
  };

  const confirmDelete = () => {
    confirmEventDeletion(title, () => {
      setIsDeleting(true);
      deleteEvent(event.id);
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
              onSubmit={() => void saveTitle()}
              title={isEditingTitle ? draftTitle : title}
            />
          ),
          headerBackTitle: 'Back',
          headerLeft: isEditingTitle
            ? () => (
                <Pressable
                  accessibilityLabel="Cancel title editing"
                  accessibilityRole="button"
                  disabled={isSavingTitle}
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
                  disabled={isSavingTitle}
                  hitSlop={8}
                  onPress={() => void saveTitle()}
                  style={({ pressed }) => [
                    styles.headerTextButton,
                    isSavingTitle && styles.disabledButton,
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
              <DateMetadata
                value={eventDate}
                onChange={(nextDate) =>
                  void saveImmediate(
                    'date',
                    nextDate,
                    eventDate,
                    setEventDate,
                    {
                      date: nextDate.date as LocalDate,
                      time: (nextDate.time as LocalTime | undefined) ?? null,
                    }
                  )
                }
              />
            </MetadataRow>
            <MetadataRow
              label="Tags"
              icon={<Tags size={14} strokeWidth={2} color={colors.textMuted} />}
            >
              <TagsMetadata
                value={tags}
                onChange={(nextTags) =>
                  void saveImmediate('tags', nextTags, tags, setTags, {
                    tagIds: nextTags.map((tag) => tag.id),
                  })
                }
              />
            </MetadataRow>
            <MetadataRow
              label="Category"
              icon={
                <Shapes size={14} strokeWidth={2} color={colors.textMuted} />
              }
            >
              <CategoryMetadata
                value={category}
                onChange={(nextCategory) =>
                  void saveImmediate(
                    'category',
                    nextCategory,
                    category,
                    setCategory,
                    { categoryId: nextCategory?.id ?? null }
                  )
                }
              />
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
              <PeopleMetadata
                value={people}
                onChange={(nextPeople) =>
                  void saveImmediate('people', nextPeople, people, setPeople, {
                    peopleIds: nextPeople.map((person) => person.id),
                  })
                }
              />
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
                onChange={(nextSignificance) => {
                  if (!nextSignificance) return;

                  void saveImmediate(
                    'significance',
                    nextSignificance,
                    significance,
                    setSignificance,
                    {
                      significance: nextSignificance.id as EventSignificance,
                    }
                  );
                }}
              />
            </MetadataRow>
            <MetadataRow
              label="Location"
              icon={
                <MapPin size={14} strokeWidth={2} color={colors.textMuted} />
              }
            >
              <LocationMetadata
                value={location}
                onChange={(nextLocation) =>
                  void saveImmediate(
                    'location',
                    nextLocation,
                    location,
                    setLocation,
                    { locationId: nextLocation?.id ?? null }
                  )
                }
              />
            </MetadataRow>
          </View>

          <View style={styles.contentSection}>
            <EventNotes
              committedValue={committedNotes}
              draftValue={draftNotes}
              onDraftChange={setDraftNotes}
              onSave={saveNotes}
              onCancel={() => setDraftNotes(committedNotes)}
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
  readState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    padding: spacing[6],
  },
  readStateTitle: {
    ...typography.h3,
    textAlign: 'center',
  },
  readStateMessage: {
    ...typography.small,
    maxWidth: 320,
    textAlign: 'center',
  },
  readStateButton: {
    minHeight: 42,
    justifyContent: 'center',
    marginTop: spacing[2],
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
  },
  readStateButtonText: {
    ...typography.small,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
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
