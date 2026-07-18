import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
} from 'react-hook-form';
import { FormField, useFormFieldA11y } from './FormField';
import { Select, type SelectProps } from './Select';

interface FormSelectProps<TFieldValues extends FieldValues> extends Omit<
  SelectProps,
  'name' | 'defaultValue' | 'value' | 'onChange'
> {
  name: FieldPath<TFieldValues>;
  control: Control<TFieldValues>;
  label?: string;
  description?: string;
  rules?: RegisterOptions<TFieldValues, FieldPath<TFieldValues>>;
  required?: boolean;
}

function FormSelect<TFieldValues extends FieldValues>({
  name,
  control,
  label,
  description,
  rules,
  required,
  ...selectProps
}: FormSelectProps<TFieldValues>) {
  const a11y = useFormFieldA11y(selectProps.id, Boolean(description));

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
            <Select
              {...selectProps}
              {...field}
              id={a11y.inputId}
              aria-describedby={describedBy}
              aria-invalid={fieldState.invalid || undefined}
              value={field.value ?? ''}
              variant={fieldState.error ? 'error' : selectProps.variant}
            />
          </FormField>
        );
      }}
    />
  );
}

export { FormSelect, type FormSelectProps };
