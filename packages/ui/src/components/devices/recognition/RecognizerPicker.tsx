import * as React from 'react';
import { Check, ScanSearch } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { cn } from '@/lib/utils';
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="recognizer-picker-content">
        <DialogTitle>{title}</DialogTitle>

        {recognizers.length === 0 ? (
          <p className="recognizer-picker-empty">{emptyLabel}</p>
        ) : (
          <ul className="recognizer-picker-list">
            {recognizers.map((recognizer) => (
              <li key={recognizer.id}>
                <button
                  type="button"
                  className={cn(
                    'recognizer-picker-row',
                    recognizer.id === selectedId && 'selected',
                  )}
                  onClick={() => onSelect(recognizer.id)}
                >
                  <ScanSearch size={18} aria-hidden="true" />
                  <span className="recognizer-picker-row-body">
                    <span className="recognizer-picker-row-name">
                      {recognizer.name}
                    </span>
                    <span className="recognizer-picker-row-model">
                      {recognizer.model}
                    </span>
                  </span>
                  {recognizer.id === selectedId && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};

export { RecognizerPicker, type RecognizerPickerProps };
