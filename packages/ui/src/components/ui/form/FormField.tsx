/* eslint-disable react-refresh/only-export-components -- Field and its shared accessibility hook form one UI primitive. */
import * as React from 'react';
import { cn } from '@/lib/utils';
import './FormField.css';

interface FormFieldProps {
  label?: string;
  error?: string;
  required?: boolean;
  description?: string;
  htmlFor?: string;
  descriptionId?: string;
  errorId?: string;
  children: React.ReactNode;
  className?: string;
}

function useFormFieldA11y(
  providedId: string | undefined,
  hasDescription: boolean,
) {
  const generatedId = React.useId();
  const inputId = providedId ?? `${generatedId}-control`;
  const descriptionId = hasDescription
    ? `${generatedId}-description`
    : undefined;

  return {
    inputId,
    descriptionId,
  };
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required = false,
  description,
  htmlFor,
  descriptionId,
  errorId,
  children,
  className,
}) => {
  return (
    <div className={cn('form-field', className)}>
      {label && (
        <label className="form-field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="form-field__required">*</span>}
        </label>
      )}
      {description && (
        <p className="form-field__description" id={descriptionId}>
          {description}
        </p>
      )}
      <div className="form-field__input-wrapper">{children}</div>
      {error && (
        <p className="form-field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
};

export { FormField, useFormFieldA11y, type FormFieldProps };
