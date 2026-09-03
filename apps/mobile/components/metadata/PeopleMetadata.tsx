import { Alert } from 'react-native';
import { useState } from 'react';
import { useCreatePersonMutation, usePeopleQuery } from '@/data/query';
import CreatableTokenInput from '../ui/CreatableTokenInput';
import type { SelectOption } from '../ui/select';

type PeopleMetadataProps = {
  value?: SelectOption[];
  onChange?: (value: SelectOption[]) => void;
  maxVisibleValues?: number;
};

export default function PeopleMetadata({
  value,
  onChange,
  maxVisibleValues,
}: PeopleMetadataProps = {}) {
  const peopleQuery = usePeopleQuery();
  const createPerson = useCreatePersonMutation();
  const [internalValue, setInternalValue] = useState<SelectOption[]>([]);
  const selectedPeople = value ?? internalValue;
  const setSelectedPeople = onChange ?? setInternalValue;
  const options = (peopleQuery.data ?? []).map((person) => ({
    id: person.id,
    label: person.name,
  }));

  return (
    <CreatableTokenInput
      prefix="@"
      placeholder="Add person"
      searchPlaceholder="Search or create a person..."
      options={options}
      values={selectedPeople}
      maxVisibleValues={maxVisibleValues}
      onChange={setSelectedPeople}
      onCreate={async (label) => {
        const person = await createPerson.mutateAsync({ name: label });

        return { id: person.id, label: person.name };
      }}
      onCreateError={(error) =>
        Alert.alert(
          'Couldn’t create person',
          error instanceof Error ? error.message : 'Please try again.'
        )
      }
      disabled={peopleQuery.isPending || peopleQuery.isError}
    />
  );
}
