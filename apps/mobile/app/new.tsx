import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
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
import EventAttachments from '@/components/event-attachments/EventAttachments';
import type {
  AttachmentDraft,
  AttachmentPreview,
} from '@/components/event-attachments/types';
import type { SelectOption } from '@/components/ui/select';
import {
  useCreateEventMutation,
  useImportAttachmentMutation,
} from '@/data/query';
import {
  EVENT_TITLE_MAX_LENGTH,
  type EventSignificance,
  type LocalDate,
  type LocalTime,
} from '@/models';
import { radius, spacing, typography } from '@lel/design';
import { useTheme } from '@lel/design/useTheme';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { router } from 'expo-router';
import {
  BadgeAlert,
  Calendar,
  ChevronDown,
  ChevronUp,
  MapPin,
  Shapes,
  Tags,
  UsersRound,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEFAULT_SIGNIFICANCE: SelectOption = {
  id: 'ordinary',
  label: 'Ordinary',
};

type DraftAttachment = AttachmentDraft & { id: string };

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
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const nextAttachmentId = useRef(0);
  const createEventMutation = useCreateEventMutation();
  const importAttachmentMutation = useImportAttachmentMutation();

  const canCreate = title.trim().length > 0 && !isCreating;
  const hasChanges =
    title.length > 0 ||
    date.date !== initialDate.date ||
    date.time !== initialDate.time ||
    category !== null ||
    people.length > 0 ||
    tags.length > 0 ||
    significance?.id !== DEFAULT_SIGNIFICANCE.id ||
    location !== null ||
    notes.length > 0 ||
    attachments.length > 0;

  const attachmentPreviews: AttachmentPreview[] = attachments.map(
    (attachment) => ({
      id: attachment.id,
      uri: attachment.uri,
      isAvailable: true,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      width: attachment.width,
      height: attachment.height,
    })
  );

  const addAttachmentDrafts = async (drafts: AttachmentDraft[]) => {
    setAttachments((current) => [
      ...current,
      ...drafts.map((draft) => ({
        ...draft,
        id: `draft-${nextAttachmentId.current++}`,
      })),
    ]);
  };

  const removeAttachmentDraft = async (attachment: AttachmentPreview) => {
    setAttachments((current) =>
      current.filter((draft) => draft.id !== attachment.id)
    );
  };

  const reorderAttachmentDrafts = async (attachmentIds: string[]) => {
    setAttachments((current) => {
      const byId = new Map(current.map((draft) => [draft.id, draft]));
      return attachmentIds.flatMap((id) => {
        const draft = byId.get(id);
        return draft ? [draft] : [];
      });
    });
  };

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
      const created = await createEventMutation.mutateAsync({
        title: nextTitle,
        date: date.date as LocalDate,
        time: (date.time as LocalTime | undefined) ?? null,
        significance: (significance?.id ??
          DEFAULT_SIGNIFICANCE.id) as EventSignificance,
        categoryId: category?.id ?? null,
        locationId: location?.id ?? null,
        notes,
        tagIds: tags.map((tag) => tag.id),
        peopleIds: people.map((person) => person.id),
      });

      const failedAttachments: DraftAttachment[] = [];

      for (const attachment of attachments) {
        try {
          await importAttachmentMutation.mutateAsync({
            eventId: created.event.id,
            sourceUri: attachment.uri,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            width: attachment.width,
            height: attachment.height,
            fileSize: attachment.fileSize,
          });
        } catch {
          failedAttachments.push(attachment);
        }
      }

      if (failedAttachments.length > 0) {
        Alert.alert(
          'Event created with missing attachments',
          `${failedAttachments.length} ${
            failedAttachments.length === 1
              ? 'attachment was'
              : 'attachments were'
          } not added. You can add ${
            failedAttachments.length === 1 ? 'it' : 'them'
          } from the event page.`,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      } else {
        router.back();
      }
    } catch (error) {
      setIsCreating(false);
      Alert.alert(
        'Couldn’t create event',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <SafeAreaView
        edges={['top']}
        style={[
          styles.toolbarSafeArea,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isCreating }}
            disabled={isCreating}
            onPress={() => router.back()}
            style={[styles.toolbarButton, styles.toolbarButtonLeft]}
          >
            <Text style={[styles.toolbarButtonText, { color: colors.text }]}>
              Cancel
            </Text>
          </Pressable>

          <Text
            numberOfLines={1}
            style={[styles.toolbarTitle, { color: colors.text }]}
          >
            Create event
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canCreate }}
            disabled={!canCreate}
            onPress={() => void createEvent()}
            style={[styles.toolbarButton, styles.toolbarButtonRight]}
          >
            <Text
              style={[
                styles.toolbarButtonText,
                {
                  color: canCreate ? colors.primary : colors.textMuted,
                  fontWeight: '700',
                },
              ]}
            >
              {isCreating ? 'Creating…' : 'Create'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      <KeyboardAwareScrollView
        style={styles.contentArea}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={16}
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
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showMoreDetails }}
          onPress={() => setShowMoreDetails((current) => !current)}
          style={({ pressed }) => [
            styles.moreDetailsButton,
            { borderColor: colors.border },
            pressed && { backgroundColor: colors.interactiveMuted },
          ]}
        >
          <Text style={[styles.moreDetailsText, { color: colors.text }]}>
            {showMoreDetails ? 'Hide details' : 'More details'}
          </Text>
          {showMoreDetails ? (
            <ChevronUp color={colors.textSecondary} size={20} />
          ) : (
            <ChevronDown color={colors.textSecondary} size={20} />
          )}
        </Pressable>

        {showMoreDetails && (
          <View style={styles.moreDetails}>
            <MetadataRow
              label="Category"
              icon={<Shapes color={colors.textMuted} size={16} />}
            >
              <CategoryMetadata value={category} onChange={setCategory} />
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
              label="Tags"
              icon={<Tags color={colors.textMuted} size={16} />}
            >
              <TagsMetadata value={tags} onChange={setTags} />
            </MetadataRow>
            <MetadataRow
              label="People"
              icon={<UsersRound color={colors.textMuted} size={16} />}
            >
              <PeopleMetadata value={people} onChange={setPeople} />
            </MetadataRow>
            <MetadataRow
              label="Location"
              icon={<MapPin color={colors.textMuted} size={16} />}
            >
              <LocationMetadata value={location} onChange={setLocation} />
            </MetadataRow>

            <View style={styles.contentSection}>
              <Text style={[styles.sectionHeading, { color: colors.text }]}>
                Notes
              </Text>
              <TextInput
                accessibilityLabel="Event notes"
                editable={!isCreating}
                multiline
                scrollEnabled={false}
                onChangeText={setNotes}
                placeholder="Add notes…"
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.focus}
                style={[
                  styles.notesInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                textAlignVertical="top"
                value={notes}
              />
            </View>

            <View style={styles.contentSection}>
              <EventAttachments
                attachments={attachmentPreviews}
                draftMode
                onAdd={addAttachmentDrafts}
                onRemove={removeAttachmentDraft}
                onReorder={reorderAttachmentDrafts}
              />
            </View>
          </View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
  toolbarSafeArea: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbarButton: {
    width: 96,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  toolbarButtonLeft: {
    alignItems: 'flex-start',
  },
  toolbarButtonRight: {
    alignItems: 'flex-end',
  },
  toolbarTitle: {
    ...typography.h3,
    flex: 1,
    textAlign: 'center',
  },
  toolbarButtonText: {
    ...typography.small,
    fontWeight: '600',
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
  moreDetailsButton: {
    minHeight: 48,
    marginTop: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing[2],
  },
  moreDetailsText: {
    ...typography.body,
    fontWeight: '600',
  },
  moreDetails: {
    paddingTop: spacing[2],
  },
  contentSection: {
    marginTop: spacing[6],
  },
  sectionHeading: {
    ...typography.h3,
    marginBottom: spacing[2],
  },
  notesInput: {
    minHeight: 128,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    ...typography.body,
  },
});
