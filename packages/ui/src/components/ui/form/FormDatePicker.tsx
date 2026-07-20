import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
} from 'react-hook-form';
import { FormField, useFormFieldA11y } from './FormField';
import { DatePicker, type DatePickerProps } from './DatePicker';

interface FormDatePickerProps<TFieldValues extends FieldValues> extends Omit<
  DatePickerProps,
  'name' | 'defaultValue' | 'value' | 'onChange'
> {
  name: FieldPath<TFieldValues>;
  control: Control<TFieldValues>;
  label?: string;
  description?: string;
  rules?: RegisterOptions<TFieldValues, FieldPath<TFieldValues>>;
  required?: boolean;
}

function FormDatePicker<TFieldValues extends FieldValues>({
  name,
  control,
  label,
  description,
  rules,
  required,
  ...datePickerProps
}: FormDatePickerProps<TFieldValues>) {
  const a11y = useFormFieldA11y(datePickerProps.id, Boolean(description));

  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      render={({ field, fieldState }) => {
        const errorId = fieldState.error ? `${a11y.inputId}-error` : undefined;
        const describedBy =
          [a11y.descriptionId, errorId].filter(Boolean).join(' ') || undefined;
        return (
          <FormField
            label={label}
            required={required || Boolean(rules?.required)}
            description={description}
            error={fieldState.error?.message}
            htmlFor={a11y.inputId}
            descriptionId={a11y.descriptionId}
            errorId={errorId}
          >
            <DatePicker
              {...datePickerProps}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              id={a11y.inputId}
              aria-describedby={describedBy}
              aria-invalid={fieldState.invalid || undefined}
              value={field.value ?? ''}
              onChange={(event) => {
                const next = event.target.value;
                field.onChange(next === '' ? null : next);
              }}
              variant={fieldState.error ? 'error' : datePickerProps.variant}
            />
          </FormField>
        );
      }}
    />
  );
}

export { FormDatePicker, type FormDatePickerProps };
