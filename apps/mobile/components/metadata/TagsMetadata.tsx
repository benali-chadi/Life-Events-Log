import { Alert } from 'react-native';
import { useState } from 'react';
import { useCreateTagMutation, useTagsQuery } from '@/data/query';
import CreatableTokenInput from '../ui/CreatableTokenInput';
import type { SelectOption } from '../ui/select';

type TagsMetadataProps = {
  value?: SelectOption[];
  onChange?: (value: SelectOption[]) => void;
  maxVisibleValues?: number;
};

export default function TagsMetadata({
  value,
  onChange,
  maxVisibleValues,
}: TagsMetadataProps = {}) {
  const tagsQuery = useTagsQuery();
  const createTag = useCreateTagMutation();
  const [internalValue, setInternalValue] = useState<SelectOption[]>([]);
  const selectedTags = value ?? internalValue;
  const setSelectedTags = onChange ?? setInternalValue;
  const options = (tagsQuery.data ?? []).map((tag) => ({
    id: tag.id,
    label: tag.name,
  }));

  return (
    <CreatableTokenInput
      prefix="#"
      placeholder="Add tags"
      searchPlaceholder="Search or create a tag..."
      options={options}
      values={selectedTags}
      maxVisibleValues={maxVisibleValues}
      onChange={setSelectedTags}
      onCreate={async (label) => {
        const tag = await createTag.mutateAsync({ name: label });

        return { id: tag.id, label: tag.name };
      }}
      onCreateError={(error) =>
        Alert.alert(
          'Couldn’t create tag',
          error instanceof Error ? error.message : 'Please try again.'
        )
      }
      disabled={tagsQuery.isPending || tagsQuery.isError}
    />
  );
}
