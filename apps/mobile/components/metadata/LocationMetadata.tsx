import { useState } from 'react';
import type { SelectOption } from '../ui/select';
import SingleSelect from '../ui/SingleSelect';

const initialLocations: SelectOption[] = [
  { id: 'rabat', label: 'Rabat' },
  { id: 'Sale', label: 'Sale' },
  { id: 'cafe-maure', label: 'Cafe Maure' },
];

type LocationMetadataProps = {
  value?: SelectOption | null;
  onChange?: (value: SelectOption | null) => void;
};

export default function LocationMetadata({
  value,
  onChange,
}: LocationMetadataProps = {}) {
  const [locations, setLocations] = useState(initialLocations);
  const [internalValue, setInternalValue] = useState<SelectOption | null>(
    initialLocations[1]
  );
  const location = value === undefined ? internalValue : value;
  const setLocation = onChange ?? setInternalValue;

  const createLocation = (label: string) => {
    const newLocation = { id: Date.now().toString(), label };
    setLocations((current) => [...current, newLocation]);
    return newLocation;
  };

  return (
    <SingleSelect
      value={location}
      options={locations}
      onChange={setLocation}
      onCreate={createLocation}
      placeholder="Add location"
      searchPlaceholder="Search or create a location..."
    />
  );
}
