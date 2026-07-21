import { useState } from 'react';
import SingleSelect from '../ui/SingleSelect';
import type { SelectOption } from '../ui/select';

const significanceOptions: SelectOption[] = [
  { id: 'ordinary', label: 'Ordinary' },
  { id: 'notable', label: 'Notable' },
  { id: 'major', label: 'Major' },
  { id: 'turning-point', label: 'Turning point' },
];

export default function SignificanceMetadata() {
  const [significance, setSignificance] = useState<SelectOption | null>(
    significanceOptions[1]
  );

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
