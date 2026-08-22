import * as React from 'react';
import {
  CardList,
  CardListContent,
  CardListItem,
} from '@/components/ui/CardList';
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
  /**
   * Id of the visible heading that already asks the question. The group is
   * named by reference rather than by its own legend, so the prompt is not
   * announced twice.
   */
  labelledBy: string;
  name?: string;
}

/**
 * Grouped radio list of providers or accounts.
 *
 * The rows are the app's list rows in their radio mode — real
 * `<input type="radio">` elements inside `<label>`s, so keyboard roving, form
 * semantics and screen-reader grouping come for free. What is left here is
 * what is actually about providers: the grouping and the brand tile.
 */
export const ProviderPickerList: React.FC<ProviderPickerListProps> = ({
  groups,
  value,
  onChange,
  labelledBy,
  name = 'provider-picker-list',
}) => {
  return (
    <fieldset className="provider-picker-list" aria-labelledby={labelledBy}>
      {groups.map((group, groupIndex) => (
        <div className="provider-picker-group" key={group.label ?? groupIndex}>
          {group.label && (
            <p className="provider-picker-group-label">{group.label}</p>
          )}
          <CardList className="provider-picker-rows">
            {group.options.map((option) => (
              <CardListItem
                key={option.value}
                icon={
                  <ProviderBrandTile provider={option.provider} size="sm" />
                }
                radio={{
                  name,
                  value: option.value,
                  checked: value === option.value,
                  disabled: option.disabled,
                  onChange: () => onChange(option.value),
                }}
              >
                <CardListContent
                  title={option.title}
                  description={option.meta}
                />
              </CardListItem>
            ))}
          </CardList>
        </div>
      ))}
    </fieldset>
  );
};
