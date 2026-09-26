import * as React from 'react';
import { DashboardTile } from '@/components/layout/DashboardTile';
import { ResponsiveTileGrid } from '@/components/layout/ResponsiveTileGrid';
import { SelectTriggerButton } from '@/components/ui/AdaptiveSelect';
import { FormTile, Input, Select } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import type { CompartmentDraft } from '@/lib/deviceControlDraft';
import type { ResolvedCompartmentLayout } from '@/lib/deviceControlLabels';
import './CompartmentsField.css';

interface CompartmentsFieldProps {
  layoutLabel: string;
  layouts: ResolvedCompartmentLayout[];
  layout: ResolvedCompartmentLayout;
  compartments: CompartmentDraft[];
  /** Per compartment, the name of the food it holds, or null for none. */
  foodNames: (string | null)[];
  onLayoutChange: (layout: string) => void;
  onPickFood: (index: number) => void;
  onNumberChange: (index: number, field: 'portion', text: string) => void;
  chooseFoodLabel: string;
  disabled?: boolean;
  busyLabel?: string;
  error?: string;
}

/**
 * A compartmented setting as a layout tile, then one row per compartment: a
 * tile for what it holds, named by the compartment, and a tile for each
 * number it takes.
 */
const CompartmentsField: React.FC<CompartmentsFieldProps> = ({
  layoutLabel,
  layouts,
  layout,
  compartments,
  foodNames,
  onLayoutChange,
  onPickFood,
  onNumberChange,
  chooseFoodLabel,
  disabled,
  busyLabel,
  error,
}) => {
  const id = React.useId();
  const { food, portion } = layout.fields;
  return (
    <div className="compartments-field">
      <ResponsiveTileGrid>
        <DashboardTile>
          <FormTile
            label={layoutLabel}
            htmlFor={`${id}-layout`}
            busyLabel={busyLabel}
            error={error}
          >
            <Select
              id={`${id}-layout`}
              className="compartments-field-select"
              value={layout.value}
              options={layouts.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
              onChange={(event) => onLayoutChange(event.target.value)}
              disabled={disabled}
            />
          </FormTile>
        </DashboardTile>
      </ResponsiveTileGrid>
      <div
        className={cn(
          'compartments-field-rows',
          food && portion ? 'paired' : null,
        )}
      >
        {layout.compartments.map((name, index) => (
          <React.Fragment key={`${layout.value}-${index}`}>
            {food ? (
              <FormTile label={name} htmlFor={`${id}-food-${index}`}>
                <SelectTriggerButton
                  id={`${id}-food-${index}`}
                  className="compartments-field-select"
                  label={`${name}: ${food.label}`}
                  text={foodNames[index] ?? undefined}
                  placeholder={chooseFoodLabel}
                  onClick={() => onPickFood(index)}
                  disabled={disabled}
                />
              </FormTile>
            ) : null}
            {portion && portion.type.kind === 'number' ? (
              <FormTile
                label={portion.label}
                htmlFor={`${id}-portion-${index}`}
              >
                <span className="compartments-field-number">
                  <Input
                    id={`${id}-portion-${index}`}
                    className="compartments-field-number-input"
                    type="number"
                    inputMode="decimal"
                    aria-label={`${name}: ${portion.label}`}
                    value={String(compartments[index]?.portion ?? '')}
                    min={portion.type.min}
                    max={portion.type.max}
                    step={portion.type.step ?? 'any'}
                    onChange={(event) =>
                      onNumberChange(index, 'portion', event.target.value)
                    }
                    disabled={disabled}
                  />
                  {portion.type.unit ? (
                    <span className="compartments-field-unit">
                      {portion.type.unit}
                    </span>
                  ) : null}
                </span>
              </FormTile>
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export { CompartmentsField, type CompartmentsFieldProps };
