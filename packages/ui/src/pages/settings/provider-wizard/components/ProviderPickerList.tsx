import * as React from 'react';
import { ProviderBrandTile } from '../../providers/components/ProviderBrandTile';
import './ProviderPickerList.css';

export interface PickerOption {
  /** Provider name, or an account id as a string. */
  value: string;
  title: string;
  meta?: React.ReactNode;
  /** Drives the brand tile. */
  provider: string;
  disabled?: boolean;
}

export interface PickerGroup {
  /** Already-translated group heading. Omit for a single ungrouped list. */
  label?: string;
  options: PickerOption[];
}

interface ProviderPickerListProps {
  groups: PickerGroup[];
  value: string | null;
  onChange: (value: string) => void;
  /** Accessible name for the whole radio group. */
  legend: string;
  name?: string;
}

/**
 * Grouped radio list of providers or accounts.
 *
 * Built on real `<input type="radio">` elements inside `<label>`s so keyboard
 * roving, form semantics and screen-reader grouping come for free — the visual
 * dot is decorative only.
 */
export const ProviderPickerList: React.FC<ProviderPickerListProps> = ({
  groups,
  value,
  onChange,
  legend,
  name = 'provider-picker',
}) => {
  return (
    <fieldset className="provider-picker">
      <legend className="sr-only">{legend}</legend>
      {groups.map((group, groupIndex) => (
        <div className="provider-picker-group" key={group.label ?? groupIndex}>
          {group.label && (
            <p className="provider-picker-group-label">{group.label}</p>
          )}
          <div className="provider-picker-rows">
            {group.options.map((option) => (
              <label
                className="provider-picker-row"
                key={option.value}
                data-disabled={option.disabled || undefined}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={name}
                  value={option.value}
                  checked={value === option.value}
                  disabled={option.disabled}
                  onChange={() => onChange(option.value)}
                />
                <ProviderBrandTile provider={option.provider} size="sm" />
                <span className="provider-picker-text">
                  <span className="provider-picker-title">{option.title}</span>
                  {option.meta && (
                    <span className="provider-picker-meta">{option.meta}</span>
                  )}
                </span>
                <span className="provider-picker-dot" aria-hidden="true" />
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
};
