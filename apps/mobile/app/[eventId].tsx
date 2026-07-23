import { useTheme } from '@lel/design/useTheme';
import { Stack } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  BadgeAlert,
  Calendar,
  MapPin,
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

const initialTitle = 'Started working on Life Events Log';

const initialNotes = `Started working on the first version today.

The central idea is **a timeline, not a database**.

- Keep capture lightweight
- Make ordinary events worth recording
- Preserve the user's ownership of their data

> The product should feel closer to a personal archive than a social feed.`;

export default function EventScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const titleInputRef = useRef<TextInput>(null);

  const [eventDate, setEventDate] = useState<DateValue>(currentDateValue);

  const [title, setTitle] = useState(initialTitle);
  const [draftTitle, setDraftTitle] = useState(initialTitle);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [attachments, setAttachments] = useState<EventAttachment[]>([]);
  const hasUnsavedNotes = notes !== savedNotes;
  const hasUnsavedTitle = isEditingTitle && draftTitle !== title;
  const hasUnsavedChanges = hasUnsavedNotes || hasUnsavedTitle;

  usePreventRemove(hasUnsavedChanges, ({ data }) => {
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
                    {
                      minHeight: 36,
                      justifyContent: 'center',
                      borderRadius: radius.sm,
                      paddingHorizontal: spacing[1],
                    },
                    pressed && {
                      backgroundColor: colors.interactivePressed,
                    },
                  ]}
                >
                  <Text
                    style={{
                      ...typography.small,
                      color: colors.textSecondary,
                      fontWeight: '600',
                    }}
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
                    {
                      minHeight: 36,
                      justifyContent: 'center',
                      borderRadius: radius.sm,
                      paddingHorizontal: spacing[1],
                    },
                    pressed && {
                      backgroundColor: colors.interactivePressed,
                    },
                  ]}
                >
                  <Text
                    style={{
                      ...typography.small,
                      color: colors.focus,
                      fontWeight: '700',
                    }}
                  >
                    Done
                  </Text>
                </Pressable>
              )
            : undefined,
        }}
      />

      {/* Event content */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: colors.bg }}
      >
        <ScrollView
          style={{ backgroundColor: colors.bg }}
          contentContainerStyle={{
            flexGrow: 1,
            padding: spacing[2],
            paddingBottom: 160,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <MetadataRow
              label="Date"
              labelIcon={
                <Calendar size={14} strokeWidth={2} color={colors.textMuted} />
              }
              labelElement={
                <DateMetadata value={eventDate} onChange={setEventDate} />
              }
            />
            <MetadataRow
              label="Tags"
              labelIcon={
                <Tags size={14} strokeWidth={2} color={colors.textMuted} />
              }
              labelElement={<TagsMetadata />}
            />
            <MetadataRow
              label="Category"
              labelIcon={
                <Shapes size={14} strokeWidth={2} color={colors.textMuted} />
              }
              labelElement={<CategoryMetadata />}
            />
            <MetadataRow
              label="People"
              labelIcon={
                <UsersRound
                  size={14}
                  strokeWidth={2}
                  color={colors.textMuted}
                />
              }
              labelElement={<PeopleMetadata />}
            />
            <MetadataRow
              label="Significance"
              labelIcon={
                <BadgeAlert
                  size={14}
                  strokeWidth={2}
                  color={colors.textMuted}
                />
              }
              labelElement={<SignificanceMetadata />}
            />
            <MetadataRow
              label="Location"
              labelIcon={
                <MapPin size={14} strokeWidth={2} color={colors.textMuted} />
              }
              labelElement={<LocationMetadata />}
            />
          </View>

          <View style={{ marginTop: spacing[6] }}>
            <EventNotes
              value={notes}
              onChange={setNotes}
              onEditingComplete={() => setSavedNotes(notes)}
            />
          </View>

          <View style={{ marginTop: spacing[6] }}>
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
