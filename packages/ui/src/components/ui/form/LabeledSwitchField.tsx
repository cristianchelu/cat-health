import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/Switch';
import './LabeledSwitchField.css';

interface LabeledSwitchFieldProps extends Omit<
  React.ComponentProps<typeof Switch>,
  'checked' | 'onCheckedChange'
> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  enabledLabel?: string;
  disabledLabel?: string;
}

const LabeledSwitchField = React.forwardRef<
  HTMLInputElement,
  LabeledSwitchFieldProps
>(
  (
    {
      checked,
      onCheckedChange,
      enabledLabel,
      disabledLabel,
      id,
      ...switchProps
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const generatedId = React.useId();
    const inputId = id ?? `${generatedId}-switch`;
    const onLabel = enabledLabel ?? t('settings.enabled');
    const offLabel = disabledLabel ?? t('settings.disabled');

    return (
      <div className="labeled-switch-field">
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          id={inputId}
          ref={ref}
          {...switchProps}
        />
        <label htmlFor={inputId}>{checked ? onLabel : offLabel}</label>
      </div>
    );
  },
);

LabeledSwitchField.displayName = 'LabeledSwitchField';

export { LabeledSwitchField, type LabeledSwitchFieldProps };
