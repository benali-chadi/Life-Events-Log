import { useTheme } from '@lel/design/useTheme';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  BadgeAlert,
  Calendar,
  MapPin,
  MoreVertical,
  Shapes,
  Tags,
  Trash2,
  UsersRound,
} from 'lucide-react-native';
import TagsMetadata from '@/components/metadata/TagsMetadata';
import MetadataRow from '@/components/metadata/MetadataRow';
import PeopleMetadata from '@/components/metadata/PeopleMetadata';
import CategoryMetadata from '@/components/metadata/CategoryMetadata';
import SignificanceMetadata from '@/components/metadata/SignificanceMetadata';
import LocationMetadata from '@/components/metadata/LocationMetadata';
import { elevation, radius, spacing, typography } from '@lel/design';
import DateMetadata, {
  type DateValue,
} from '@/components/metadata/DateMetadata';
import { useRef, useState } from 'react';
import EventNotes from '@/components/event-notes/EventNotes';
import EventAttachments from '@/components/event-attachments/EventAttachments';
import type {
  AttachmentDraft,
  AttachmentPreview,
} from '@/components/event-attachments/types';
import EventTitleHeader from '@/components/event-title/EventTitleHeader';
import EventTitleEditor from '@/components/event-title/EventTitleEditor';
import type { SelectOption } from '@/components/ui/select';
import { useEventDeletion } from '@/components/event-deletion/EventDeletionProvider';
import { confirmEventDeletion } from '@/components/event-deletion/confirmEventDeletion';
import {
  useDeleteAttachmentMutation,
  useDeleteManyAttachmentsMutation,
  useEventDetailsQuery,
  useImportAttachmentMutation,
  useReorderAttachmentsMutation,
  useUpdateEventMutation,
} from '@/data/query';
import type { UpdateEventInput } from '@/data/repositories';
import { resolveAttachmentFile } from '@/data/attachments';
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
  const importAttachment = useImportAttachmentMutation();
  const deleteAttachment = useDeleteAttachmentMutation();
  const deleteManyAttachments = useDeleteManyAttachmentsMutation();
  const reorderAttachments = useReorderAttachmentsMutation();
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
  const attachments: AttachmentPreview[] = details.attachments.map(
    (attachment) => {
      const file = resolveAttachmentFile(attachment.relativePath);

      return {
        id: attachment.id,
        uri: file.uri,
        isAvailable: file.isAvailable,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        width: attachment.width,
        height: attachment.height,
      };
    }
  );
  const hasUnsavedNotes = draftNotes !== committedNotes;
  const hasUnsavedTitle = isEditingTitle && draftTitle.trim() !== title;
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
  };

  const cancelTitleEditing = () => {
    setDraftTitle(title);
    setIsEditingTitle(false);
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

  const addAttachments = async (drafts: AttachmentDraft[]) => {
    for (const draft of drafts) {
      await importAttachment.mutateAsync({
        eventId: event.id,
        sourceUri: draft.uri,
        filename: draft.filename,
        mimeType: draft.mimeType,
        width: draft.width,
        height: draft.height,
        fileSize: draft.fileSize,
      });
    }
  };

  const removeAttachment = async (attachment: AttachmentPreview) => {
    await deleteAttachment.mutateAsync({
      id: attachment.id,
      eventId: event.id,
    });
  };

  const removeAttachments = async (attachments: AttachmentPreview[]) => {
    await deleteManyAttachments.mutateAsync({
      ids: attachments.map(({ id }) => id),
      eventId: event.id,
    });
  };

  const reorderEventAttachments = async (attachmentIds: string[]) => {
    await reorderAttachments.mutateAsync({
      eventId: event.id,
      attachmentIds,
    });
  };

  const confirmDelete = () => {
    confirmEventDeletion(title, () => {
      void (async () => {
        setIsDeleting(true);

        try {
          await deleteEvent({ id: event.id, title });
          router.back();
        } catch {
          setIsDeleting(false);
          Alert.alert(
            'Could not delete event',
            'The event was not deleted. Please try again.'
          );
        }
      })();
    });
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => <EventTitleHeader title={title} />,
          headerBackTitle: 'Back',
          headerRight: () => (
            <EventActionsMenu disabled={isDeleting} onDelete={confirmDelete} />
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
          <View style={styles.titleSection}>
            <EventTitleEditor
              value={draftTitle}
              savedValue={title}
              isEditing={isEditingTitle}
              isSaving={isSavingTitle}
              onBeginEditing={beginTitleEditing}
              onChange={setDraftTitle}
              onSave={() => void saveTitle()}
              onCancel={cancelTitleEditing}
            />
          </View>

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
              onAdd={addAttachments}
              onRemove={removeAttachment}
              onRemoveMany={removeAttachments}
              onReorder={reorderEventAttachments}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const EVENT_MENU_WIDTH = 216;

function EventActionsMenu({
  disabled,
  onDelete,
}: {
  disabled: boolean;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const triggerRef = useRef<View>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);

  const openMenu = () => {
    if (disabled) return;

    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setMenuPosition({
        top: y + height + spacing[1],
        right: Math.max(spacing[2], windowWidth - x - width),
      });
    });
  };

  const closeMenu = () => setMenuPosition(null);
  const deleteEvent = () => {
    closeMenu();
    requestAnimationFrame(onDelete);
  };

  return (
    <>
      <Pressable
        ref={triggerRef}
        accessibilityLabel="Event actions"
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: menuPosition !== null }}
        disabled={disabled}
        hitSlop={8}
        onPress={openMenu}
        style={({ pressed }) => [
          styles.headerMenuButton,
          disabled && styles.disabledMenuButton,
          pressed && { backgroundColor: colors.interactivePressed },
        ]}
      >
        <MoreVertical color={colors.textSecondary} size={21} strokeWidth={2} />
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={closeMenu}
        statusBarTranslucent
        transparent
        visible={menuPosition !== null}
      >
        <View style={styles.menuModalRoot}>
          <Pressable
            accessibilityLabel="Close event actions"
            accessibilityRole="button"
            onPress={closeMenu}
            style={StyleSheet.absoluteFill}
          />

          {menuPosition && (
            <View
              accessibilityViewIsModal
              style={[
                styles.eventMenu,
                elevation.dropdown,
                menuPosition,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                  shadowColor: colors.text,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={deleteEvent}
                style={({ pressed }) => [
                  styles.eventMenuItem,
                  pressed && { backgroundColor: colors.destructiveMuted },
                ]}
              >
                <Trash2 color={colors.destructive} size={18} strokeWidth={2} />
                <Text
                  style={[
                    styles.eventMenuItemText,
                    { color: colors.destructive },
                  ]}
                >
                  Delete event
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </Modal>
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
  scrollContent: {
    flexGrow: 1,
    padding: spacing[2],
    paddingBottom: 160,
  },
  titleSection: {
    marginBottom: spacing[3],
  },
  contentSection: {
    marginTop: spacing[6],
  },
  headerMenuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  disabledMenuButton: {
    opacity: 0.5,
  },
  menuModalRoot: {
    flex: 1,
  },
  eventMenu: {
    position: 'absolute',
    width: EVENT_MENU_WIDTH,
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: radius.md,
  },
  eventMenuItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  eventMenuItemText: {
    ...typography.small,
    fontWeight: '600',
  },
});
