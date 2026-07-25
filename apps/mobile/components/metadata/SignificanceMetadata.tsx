import { useState } from 'react';
import SingleSelect from '../ui/SingleSelect';
import type { SelectOption } from '../ui/select';

const significanceOptions: SelectOption[] = [
  { id: 'ordinary', label: 'Ordinary' },
  { id: 'notable', label: 'Notable' },
  { id: 'major', label: 'Major' },
  { id: 'turning-point', label: 'Turning point' },
];

type SignificanceMetadataProps = {
  value?: SelectOption | null;
  onChange?: (value: SelectOption | null) => void;
};

export default function SignificanceMetadata({
  value,
  onChange,
}: SignificanceMetadataProps = {}) {
  const [internalValue, setInternalValue] = useState<SelectOption | null>(
    significanceOptions[1]
  );
  const significance = value === undefined ? internalValue : value;
  const setSignificance = onChange ?? setInternalValue;

  return (
    <SingleSelect
      value={significance}
      options={significanceOptions}
      onChange={setSignificance}
      placeholder="Select significance"
      searchPlaceholder="Search significance..."
      clearable={false}
    />
  );
}
