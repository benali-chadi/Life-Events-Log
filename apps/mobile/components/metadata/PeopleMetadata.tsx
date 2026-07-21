import { useState } from 'react';
import CreatableTokenInput from '../ui/CreatableTokenInput';
import type { SelectOption } from '../ui/select';

const initialPeople: SelectOption[] = [
  { id: '1', label: 'Mounir' },
  { id: '2', label: 'Bilal' },
  { id: '3', label: 'Issam' },
  { id: '4', label: 'Chadi' },
  { id: '5', label: 'Ali' },
];

export default function PeopleMetadata() {
  const [availablePeople, setAvailablePeople] = useState(initialPeople);
  const [selectedPeople, setSelectedPeople] = useState<SelectOption[]>([
    { id: '1', label: 'Mounir' },
    { id: '3', label: 'Issam' },
  ]);

  const creatPerson = (label: string): SelectOption => {
    const newPerson = {
      id: Date.now().toString(),
      label,
    };

    setAvailablePeople((current) => [...current, newPerson]);

    return newPerson;
  };

  return (
    <CreatableTokenInput
      prefix="@"
      placeholder="Add person"
      searchPlaceholder="Search or create a person..."
      options={availablePeople}
      values={selectedPeople}
      onChange={setSelectedPeople}
      onCreate={creatPerson}
    />
  );
}
