import * as React from 'react';
import { DashboardTile } from '@/components/layout/DashboardTile';
import { Button } from '@/components/ui/Button';
import { FormTile, Input, Select } from '@/components/ui/form';
import type { CompartmentDraft } from '@/lib/deviceControlDraft';
import type { ResolvedCompartmentLayout } from '@/lib/deviceControlLabels';
import './CompartmentsField.css';

interface CompartmentsFieldProps {
  label: string;
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
 * A compartmented setting as tiles in the caller's grid: one for the layout,
 * then one per compartment with a control for each field it takes.
 */
const CompartmentsField: React.FC<CompartmentsFieldProps> = ({
  label,
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
    <>
      <DashboardTile>
        <FormTile
          className="compartments-field"
          label={label}
          htmlFor={id}
          busyLabel={busyLabel}
          error={error}
        >
          <Select
            id={id}
            className="compartments-field-layout"
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
      {layout.compartments.map((name, index) => (
        <DashboardTile key={`${layout.value}-${index}`}>
          <FormTile className="compartments-field" label={name}>
            {food ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="compartments-field-food"
                aria-label={`${name}: ${food.label}`}
                onClick={() => onPickFood(index)}
                disabled={disabled}
              >
                {foodNames[index] ?? chooseFoodLabel}
              </Button>
            ) : null}
            {portion && portion.type.kind === 'number' ? (
              <span className="compartments-field-portion">
                <Input
                  className="compartments-field-portion-input"
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
            ) : null}
          </FormTile>
        </DashboardTile>
      ))}
    </>
  );
};

export { CompartmentsField, type CompartmentsFieldProps };
