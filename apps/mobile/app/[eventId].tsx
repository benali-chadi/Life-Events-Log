import { useTheme } from '@lel/design/useTheme';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
import { spacing } from '@lel/design';
import DateMetadata, {
  currentDateValue,
  type DateValue,
} from '@/components/metadata/DateMetadata';
import { useState } from 'react';
import EventNotes from '@/components/event-notes/EventNotes';
import EventAttachments from '@/components/event-attachments/EventAttachments';
import type { EventAttachment } from '@/components/event-attachments/types';

const initialNotes = `Started working on the first version today.

The central idea is **a timeline, not a database**.

- Keep capture lightweight
- Make ordinary events worth recording
- Preserve the user's ownership of their data

> The product should feel closer to a personal archive than a social feed.`;

export default function EventScreen() {
  const { eventId } = useLocalSearchParams();
  const { colors } = useTheme();
  const navigation = useNavigation();

  const [eventDate, setEventDate] = useState<DateValue>(currentDateValue);

  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [attachments, setAttachments] = useState<EventAttachment[]>([]);
  const hasUnsavedNotes = notes !== savedNotes;

  usePreventRemove(hasUnsavedNotes, ({ data }) => {
    Alert.alert(
      'Discard changes?',
      'Your unsaved changes to these notes will be lost.',
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

  const event = {
    id: eventId as string,
    title: 'Started working on Life Events Log',
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: event.id,
          headerBackTitle: 'Back',
          headerTitleStyle: {
            fontSize: 17,
          },
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
