import * as React from 'react';
import { cn } from '@/lib/utils';
import './FormField.css';

interface FormFieldProps {
  label?: string;
  error?: string;
  required?: boolean;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  error,
  required = false,
  description,
  children,
  className,
}) => {
  return (
    <div className={cn('form-field', className)}>
      {label && (
        <label className="form-field__label">
          {label}
          {required && <span className="form-field__required">*</span>}
        </label>
      )}
      {description && <p className="form-field__description">{description}</p>}
      <div className="form-field__input-wrapper">{children}</div>
      {error && <p className="form-field__error">{error}</p>}
    </div>
  );
};

export { FormField, type FormFieldProps };
