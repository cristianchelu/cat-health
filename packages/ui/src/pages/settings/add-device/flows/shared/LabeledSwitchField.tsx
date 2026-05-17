import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/Switch';
import './LabeledSwitchField.css';

interface LabeledSwitchFieldProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  enabledLabel?: string;
  disabledLabel?: string;
}

export const LabeledSwitchField = React.forwardRef<
  HTMLInputElement,
  LabeledSwitchFieldProps
>(({ checked, onCheckedChange, enabledLabel, disabledLabel }, ref) => {
  const { t } = useTranslation();
  const onLabel = enabledLabel ?? t('settings.enabled');
  const offLabel = disabledLabel ?? t('settings.disabled');

  return (
    <div className="labeled-switch-field">
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        ref={ref}
      />
      <span>{checked ? onLabel : offLabel}</span>
    </div>
  );
});

LabeledSwitchField.displayName = 'LabeledSwitchField';
