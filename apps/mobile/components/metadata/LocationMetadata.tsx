import { useState } from 'react';
import { Alert } from 'react-native';
import { useCreateLocationMutation, useLocationsQuery } from '@/data/query';
import type { SelectOption } from '../ui/select';
import SingleSelect from '../ui/SingleSelect';

type LocationMetadataProps = {
  value?: SelectOption | null;
  onChange?: (value: SelectOption | null) => void;
};

export default function LocationMetadata({
  value,
  onChange,
}: LocationMetadataProps = {}) {
  const locationsQuery = useLocationsQuery();
  const createLocation = useCreateLocationMutation();
  const [internalValue, setInternalValue] = useState<SelectOption | null>(null);
  const location = value === undefined ? internalValue : value;
  const setLocation = onChange ?? setInternalValue;
  const options = (locationsQuery.data ?? []).map((item) => ({
    id: item.id,
    label: item.name,
  }));

  return (
    <SingleSelect
      value={location}
      options={options}
      onChange={setLocation}
      onCreate={async (label) => {
        const created = await createLocation.mutateAsync({ name: label });

        return { id: created.id, label: created.name };
      }}
      onCreateError={(error) =>
        Alert.alert(
          'Couldn’t create location',
          error instanceof Error ? error.message : 'Please try again.'
        )
      }
      disabled={locationsQuery.isPending || locationsQuery.isError}
      placeholder="Add location"
      searchPlaceholder="Search or create a location..."
    />
  );
}
