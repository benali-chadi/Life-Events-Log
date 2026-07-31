import { useState } from 'react';
import { Alert } from 'react-native';
import { useCategoriesQuery, useCreateCategoryMutation } from '@/data/query';
import SingleSelect from '../ui/SingleSelect';
import type { SelectOption } from '../ui/select';

type CategoryMetadataProps = {
  value?: SelectOption | null;
  onChange?: (value: SelectOption | null) => void;
};

export default function CategoryMetadata({
  value,
  onChange,
}: CategoryMetadataProps = {}) {
  const categoriesQuery = useCategoriesQuery();
  const createCategory = useCreateCategoryMutation();
  const [internalValue, setInternalValue] = useState<SelectOption | null>(null);
  const category = value === undefined ? internalValue : value;
  const setCategory = onChange ?? setInternalValue;
  const options = (categoriesQuery.data ?? []).map((item) => ({
    id: item.id,
    label: item.name,
  }));

  return (
    <SingleSelect
      value={category}
      options={options}
      onChange={setCategory}
      onCreate={async (label) => {
        const created = await createCategory.mutateAsync({
          name: label,
          color: 'blue',
        });

        return { id: created.id, label: created.name };
      }}
      onCreateError={(error) =>
        Alert.alert(
          'Couldn’t create category',
          error instanceof Error ? error.message : 'Please try again.'
        )
      }
      disabled={categoriesQuery.isPending || categoriesQuery.isError}
      placeholder="Add category"
      searchPlaceholder="Search or create a category..."
    />
  );
}
