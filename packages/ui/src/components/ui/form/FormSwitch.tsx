import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
} from 'react-hook-form';
import { FormField, useFormFieldA11y } from './FormField';
import { LabeledSwitchField } from './LabeledSwitchField';

interface FormSwitchProps<TFieldValues extends FieldValues> {
  name: FieldPath<TFieldValues>;
  control: Control<TFieldValues>;
  label?: string;
  description?: string;
  /** Derived or live information under the control; hidden while an error shows. */
  hint?: string;
  rules?: RegisterOptions<TFieldValues, FieldPath<TFieldValues>>;
  required?: boolean;
  enabledLabel?: string;
  disabledLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function FormSwitch<TFieldValues extends FieldValues>({
  name,
  control,
  label,
  description,
  hint,
  rules,
  required,
  enabledLabel,
  disabledLabel,
  disabled,
  className,
  id,
}: FormSwitchProps<TFieldValues>) {
  const a11y = useFormFieldA11y(id, Boolean(description), Boolean(hint));

  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      render={({ field, fieldState }) => {
        const errorId = fieldState.error ? `${a11y.inputId}-error` : undefined;
        const describedBy =
          [a11y.descriptionId, errorId ?? a11y.hintId]
            .filter(Boolean)
            .join(' ') || undefined;
        return (
          <FormField
            label={label}
            required={required || Boolean(rules?.required)}
            description={description}
            error={fieldState.error?.message}
            className={className}
            htmlFor={a11y.inputId}
            descriptionId={a11y.descriptionId}
            hint={hint}
            hintId={a11y.hintId}
            errorId={errorId}
          >
            <LabeledSwitchField
              id={a11y.inputId}
              name={field.name}
              checked={Boolean(field.value)}
              onBlur={field.onBlur}
              onCheckedChange={field.onChange}
              enabledLabel={enabledLabel}
              disabledLabel={disabledLabel}
              disabled={disabled}
              aria-describedby={describedBy}
              aria-invalid={fieldState.invalid || undefined}
              ref={field.ref}
            />
          </FormField>
        );
      }}
    />
  );
}

export { FormSwitch, type FormSwitchProps };
