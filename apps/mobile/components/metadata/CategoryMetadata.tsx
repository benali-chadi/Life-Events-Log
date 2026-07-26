import { useState } from 'react';
import SingleSelect from '../ui/SingleSelect';
import type { SelectOption } from '../ui/select';

const initialCategories: SelectOption[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'career', label: 'Career' },
  { id: 'family', label: 'Family' },
  { id: 'travel', label: 'Travel' },
];

type CategoryMetadataProps = {
  value?: SelectOption | null;
  onChange?: (value: SelectOption | null) => void;
};

export default function CategoryMetadata({
  value,
  onChange,
}: CategoryMetadataProps = {}) {
  const [categories, setCategories] = useState(initialCategories);
  const [internalValue, setInternalValue] = useState<SelectOption | null>(
    categories[1] ?? null
  );
  const category = value === undefined ? internalValue : value;
  const setCategory = onChange ?? setInternalValue;

  const createCategory = (label: string) => {
    const newCategory = { id: Date.now().toString(), label };
    setCategories((current) => [...current, newCategory]);
    return newCategory;
  };

  return (
    <SingleSelect
      value={category}
      options={categories}
      onChange={setCategory}
      onCreate={createCategory}
      placeholder="Add category"
      searchPlaceholder="Search or create a category..."
    />
  );
}
