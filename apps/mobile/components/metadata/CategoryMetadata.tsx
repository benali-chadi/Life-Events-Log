import { useState } from 'react';
import { useCategoriesQuery, useCreateCategoryMutation } from '@/data/query';
import SingleSelect from '../ui/SingleSelect';
import type { SelectOption } from '../ui/select';
import CategoryCreationSheet from './CategoryCreationSheet';
import { suggestCategoryColor } from './suggestCategoryColor';

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
  const [creationName, setCreationName] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const category = value === undefined ? internalValue : value;
  const setCategory = onChange ?? setInternalValue;
  const options = (categoriesQuery.data ?? []).map((item) => ({
    id: item.id,
    label: item.name,
  }));

  return (
    <>
      <SingleSelect
        value={category}
        options={options}
        onChange={setCategory}
        onCreateRequest={(label) => {
          setCreationError(null);
          setCreationName(label);
        }}
        disabled={categoriesQuery.isPending || categoriesQuery.isError}
        placeholder="Add category"
        searchPlaceholder="Search or create a category..."
      />

      {creationName !== null && (
        <CategoryCreationSheet
          initialName={creationName}
          initialColor={suggestCategoryColor(categoriesQuery.data ?? [])}
          isCreating={createCategory.isPending}
          error={creationError}
          onCancel={() => {
            setCreationError(null);
            setCreationName(null);
          }}
          onCreate={(name, color) => {
            setCreationError(null);
            void createCategory
              .mutateAsync({ name, color })
              .then((created) => {
                setCategory({ id: created.id, label: created.name });
                setCreationName(null);
              })
              .catch((error: unknown) => {
                setCreationError(
                  error instanceof Error ? error.message : 'Please try again.'
                );
              });
          }}
        />
      )}
    </>
  );
}
