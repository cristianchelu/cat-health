import * as React from 'react';
import { cn } from '@/lib/utils';
import './Switch.css';

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange?.(e);
      onCheckedChange?.(e.target.checked);
    };

    return (
      <label className={cn('switch', className)}>
        <input
          type="checkbox"
          className="switch-input"
          checked={checked}
          onChange={handleChange}
          ref={ref}
          {...props}
        />
        <span className="switch-slider" />
      </label>
    );
  },
);
Switch.displayName = 'Switch';
