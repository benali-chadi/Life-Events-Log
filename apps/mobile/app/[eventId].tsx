import { useTheme } from '@lel/design/useTheme';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Keyboard, Pressable } from 'react-native';
import {
  BadgeAlert,
  Calendar,
  Shapes,
  Tags,
  UsersRound,
} from 'lucide-react-native';
import TagsMetadata from '@/components/metadata/TagsMetadata';
import MetadataRow from '@/components/metadata/MetadataRow';
import PeopleMetadata from '@/components/metadata/PeopleMetadata';
import CategoryMetadata from '@/components/metadata/CategoryMetadata';
import SignificanceMetadata from '@/components/metadata/SignificanceMetadata';
import { spacing } from '@lel/design';

export default function EventScreen() {
  const { eventId } = useLocalSearchParams();
  const { colors } = useTheme();

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
      <Pressable
        style={{
          backgroundColor: colors.bg,
          height: '100%',
          padding: spacing[2],
        }}
        onPress={Keyboard.dismiss}
      >
        <MetadataRow
          label="Date"
          labelIcon={
            <Calendar size={14} strokeWidth={2} color={colors.textMuted} />
          }
          labelElement={<TagsMetadata />}
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
            <UsersRound size={14} strokeWidth={2} color={colors.textMuted} />
          }
          labelElement={<PeopleMetadata />}
        />
        <MetadataRow
          label="Significance"
          labelIcon={
            <BadgeAlert size={14} strokeWidth={2} color={colors.textMuted} />
          }
          labelElement={<SignificanceMetadata />}
        />
      </Pressable>
    </>
  );
}
