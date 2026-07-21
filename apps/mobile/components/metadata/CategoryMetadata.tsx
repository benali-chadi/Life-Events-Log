import { useState } from 'react';
import SingleSelect from '../ui/SingleSelect';
import type { SelectOption } from '../ui/select';

const initialCategories: SelectOption[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'career', label: 'Career' },
  { id: 'family', label: 'Family' },
  { id: 'travel', label: 'Travel' },
];

export default function CategoryMetadata() {
  const [categories, setCategories] = useState(initialCategories);
  const [category, setCategory] = useState<SelectOption | null>(categories[1]);

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
      placeholder="Select category"
      searchPlaceholder="Search or create a category..."
    />
  );
}
