import * as React from 'react';
import { cn } from '@/lib/utils';
import './Checkbox.css';

interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  onCheckedChange?: (checked: boolean) => void;
  /**
   * Text after the box. Omit for a bare control that something else names —
   * a `<label htmlFor>` sitting beside it, or an `aria-label`.
   */
  label?: React.ReactNode;
}

/**
 * A box that is either ticked or not.
 *
 * Drawn rather than native, for the same reason `Switch` is: the UA control
 * cannot take the app's border, radius or primary, and `accent-color` only
 * reaches the fill. Three surfaces had each answered that differently — one
 * bare, one `accent-color`, one hand-drawn — for the same question.
 *
 * The wrapper is a `<label>` only when it has text to be. An empty label
 * contributes nothing to the accessible name but would still make a second
 * labelling relationship for whatever already names the box.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, label, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(event);
      onCheckedChange?.(event.target.checked);
    };

    const Wrapper = label != null ? 'label' : 'span';

    return (
      <Wrapper className={cn('checkbox', className)}>
        <input
          type="checkbox"
          className="checkbox-box"
          checked={checked}
          onChange={handleChange}
          ref={ref}
          {...props}
        />
        {label != null && <span className="checkbox-label">{label}</span>}
      </Wrapper>
    );
  },
);

Checkbox.displayName = 'Checkbox';

export { Checkbox, type CheckboxProps };
