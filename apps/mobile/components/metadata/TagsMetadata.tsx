import { useState } from 'react';
import CreatableTokenInput from '../ui/CreatableTokenInput';
import type { SelectOption } from '../ui/select';

const initialTags: SelectOption[] = [
  { id: '1', label: 'app' },
  { id: '2', label: 'personal' },
  { id: '3', label: 'football' },
  { id: '4', label: 'travel' },
  { id: '5', label: 'family' },
];

type TagsMetadataProps = {
  value?: SelectOption[];
  onChange?: (value: SelectOption[]) => void;
};

export default function TagsMetadata({
  value,
  onChange,
}: TagsMetadataProps = {}) {
  const [availableTags, setAvailableTags] = useState(initialTags);

  const [internalValue, setInternalValue] = useState<SelectOption[]>([
    { id: '1', label: 'app' },
    { id: '4', label: 'travel' },
  ]);
  const selectedTags = value ?? internalValue;
  const setSelectedTags = onChange ?? setInternalValue;

  const createTag = (label: string): SelectOption => {
    const newTag = {
      id: Date.now().toString(),
      label,
    };

    setAvailableTags((current) => [...current, newTag]);

    return newTag;
  };

  return (
    <CreatableTokenInput
      prefix="#"
      placeholder="Add tags"
      searchPlaceholder="Search or create a tag..."
      options={availableTags}
      values={selectedTags}
      onChange={setSelectedTags}
      onCreate={createTag}
    />
  );
}
