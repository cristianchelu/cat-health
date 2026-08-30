import * as React from 'react';
import { Cpu } from 'lucide-react';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PickerList } from '@/components/ui/PickerList';
import type { PickerOption } from '@/components/ui/pickerOptions';

export interface RecognitionAccountOption {
  id: number;
  name: string;
  /** Provider brand label, so two accounts with similar names stay tellable apart. */
  description?: string;
}

interface RecognitionAccountPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  accounts: RecognitionAccountOption[];
  /** Currently drafted account id; `null` / omitted selects the None row. */
  selectedId?: number | null;
  onSelect: (id: number | null) => void;
  noneLabel: string;
  emptyLabel: string;
}

/** The None row clears the link; every other value is an account id. */
const NONE = 'none';

/**
 * Picks which provider account this device's recognition is billed to, plus a
 * None row that clears it. Selection only reports the choice — the Recognition
 * tab owns draft vs persist, the way the camera picker does.
 *
 * `PickerSheet` + `PickerList` and nothing else: the rows, the separators, the
 * empty state and the selected check are the DS picker's, so this list stays
 * indistinguishable from the food picker's.
 */
const RecognitionAccountPicker: React.FC<RecognitionAccountPickerProps> = ({
  open,
  onOpenChange,
  title,
  accounts,
  selectedId,
  onSelect,
  noneLabel,
  emptyLabel,
}) => {
  const options: PickerOption[] = [
    {
      value: NONE,
      label: noneLabel,
      muted: true,
      leading: <Cpu size="1em" aria-hidden="true" />,
    },
    ...accounts.map((account) => ({
      value: String(account.id),
      label: account.name,
      subline: account.description,
      leading: <Cpu size="1em" aria-hidden="true" />,
    })),
  ];

  return (
    <PickerSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      onBack={() => onOpenChange(false)}
    >
      <PickerList
        optionRole="radio"
        options={accounts.length === 0 ? [] : options}
        value={selectedId == null ? NONE : String(selectedId)}
        emptyLabel={emptyLabel}
        onSelect={(value) => onSelect(value === NONE ? null : Number(value))}
      />
    </PickerSheet>
  );
};

export { RecognitionAccountPicker, type RecognitionAccountPickerProps };
