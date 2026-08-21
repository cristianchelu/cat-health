import * as React from 'react';
import { ScanSearch } from 'lucide-react';
import { PickerSheet } from '@/components/ui/PickerSheet';
import {
  CardList,
  CardListContent,
  CardListItem,
} from '@/components/ui/CardList';
import './RecognizerPicker.css';

export interface RecognizerPickerOption {
  id: number;
  name: string;
  model: string;
}

interface RecognizerPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  recognizers: RecognizerPickerOption[];
  selectedId?: number;
  onSelect: (id: number) => void;
  emptyLabel: string;
}

/**
 * Recognizer picker for switching which pet_recognizer serves this device.
 * Lists every recognizer in the account; selecting one reassigns
 * source_device_id onto this device.
 */
const RecognizerPicker: React.FC<RecognizerPickerProps> = ({
  open,
  onOpenChange,
  title,
  recognizers,
  selectedId,
  onSelect,
  emptyLabel,
}) => {
  return (
    <PickerSheet
      open={open}
      onOpenChange={onOpenChange}
      className="recognizer-picker"
      title={title}
      onBack={() => onOpenChange(false)}
    >
      {recognizers.length === 0 ? (
        <p className="recognizer-picker-empty">{emptyLabel}</p>
      ) : (
        <CardList variant="plain" className="recognizer-picker-list">
          {recognizers.map((recognizer) => (
            <CardListItem
              key={recognizer.id}
              icon={<ScanSearch size="1em" aria-hidden="true" />}
              onClick={() => onSelect(recognizer.id)}
              selected={recognizer.id === selectedId}
              indicator="check"
            >
              <CardListContent
                title={recognizer.name}
                description={recognizer.model}
              />
            </CardListItem>
          ))}
        </CardList>
      )}
    </PickerSheet>
  );
};

export { RecognizerPicker, type RecognizerPickerProps };
