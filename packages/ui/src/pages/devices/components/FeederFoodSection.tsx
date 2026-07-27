import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { GetDeviceResponseDTO } from 'shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { FormField, FormShell, Select } from '@/components/ui/form';
import { useDraftForm } from '@/hooks/form';
import { useFoods } from '@/hooks/queries/foodQueries';
import { useUpdateDevice } from '@/hooks/queries/deviceQueries';
import {
  mergeFeederFoodCompartmentsIntoConfig,
  readFeederFoodAssignments,
  resolveFeederFoodCompartments,
} from './feederFoodCompartmentsRegistry';
import './FeederFoodSection.css';

interface FeederFoodSectionProps {
  device: GetDeviceResponseDTO;
  onDirtyChange?: (dirty: boolean) => void;
}

type FoodAssignmentsDraft = Record<string, number | null>;

function foodOptionLabel(brand: string | null, name: string): string {
  const b = brand?.trim();
  return b ? `${b} — ${name}` : name;
}

const FeederFoodSection: React.FC<FeederFoodSectionProps> = ({
  device,
  onDirtyChange,
}) => {
  const { t } = useTranslation();
  const { data: foods = [], isLoading: isLoadingFoods } = useFoods();
  const updateDevice = useUpdateDevice(device.id);

  const compartments = React.useMemo(
    () => resolveFeederFoodCompartments(device),
    [device],
  );

  const compartmentOrder = React.useMemo(
    () => compartments.map((row) => row.id),
    [compartments],
  );

  /*
   * Give every rendered compartment an explicit entry, `null` when unlinked, so
   * the baseline carries the same keys the draft will. A stored config only has
   * entries for linked compartments, so without this, picking a food and then
   * setting it back to "unlinked" compares `{"0":null}` against `{}` and the
   * section reads as dirty forever — enabling Save and guarding navigation on a
   * form that is visually untouched.
   */
  const baselineAssignments = React.useMemo((): FoodAssignmentsDraft => {
    const stored = new Map(readFeederFoodAssignments(device.config));
    return Object.fromEntries(
      compartmentOrder.map((id) => [id, stored.get(id) ?? null]),
    );
  }, [device.config, compartmentOrder]);

  const assignmentsBaselineKey = JSON.stringify(baselineAssignments);
  const {
    draft: assignments,
    setDraft: setAssignments,
    isDirty,
    commit,
    requestReset,
    discardConfirm,
  } = useDraftForm(baselineAssignments, {
    baselineKey: assignmentsBaselineKey,
  });

  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const foodOptions = React.useMemo(
    () => [
      { value: '', label: t('devices.feeder.food_compartment_unlinked') },
      ...foods.map((food) => ({
        value: String(food.id),
        label: foodOptionLabel(food.brand, food.name),
      })),
    ],
    [foods, t],
  );

  const handleCompartmentChange = (compartmentId: string, value: string) => {
    setAssignments((current) => ({
      ...current,
      [compartmentId]: value === '' ? null : Number.parseInt(value, 10),
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isDirty) return;

    const config = mergeFeederFoodCompartmentsIntoConfig(
      device.config,
      new Map(Object.entries(assignments)),
      compartmentOrder,
    );
    updateDevice.mutate({ config }, { onSuccess: () => commit() });
  };

  return (
    <Card className="feeder-food-section">
      <CardHeader>
        <CardTitle>
          {t('devices.feeder.food_compartment_settings_title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="feeder-food-section-help">
          {t('devices.feeder.food_compartment_settings_help')}
        </p>

        {isLoadingFoods && (
          <p className="feeder-food-section-muted">{t('common.loading')}</p>
        )}

        {!isLoadingFoods && foods.length === 0 && (
          <p className="feeder-food-section-muted">
            {t('devices.feeder.food_compartment_no_foods')}{' '}
            <Link to="/settings">{t('settings.foods')}</Link>
          </p>
        )}

        {!isLoadingFoods && foods.length > 0 && (
          <FormShell
            onSubmit={handleSubmit}
            error={
              updateDevice.isError
                ? t('devices.feeder.food_compartment_save_error')
                : null
            }
            actions={{
              onCancel: requestReset,
              cancelLabel: t('common.cancel'),
              submitLabel: t('common.save'),
              isSubmitting: updateDevice.isPending,
              submitDisabled: !isDirty,
            }}
          >
            <div className="feeder-food-section-compartments">
              {compartments.map((compartment) => {
                const label =
                  compartment.labelKey ===
                  'devices.feeder.food_compartment_numbered'
                    ? t(compartment.labelKey, { number: compartment.id })
                    : t(compartment.labelKey);
                const current = assignments[compartment.id];
                return (
                  <FormField key={compartment.id} label={label}>
                    <Select
                      value={current != null ? String(current) : ''}
                      onChange={(e) =>
                        handleCompartmentChange(compartment.id, e.target.value)
                      }
                      options={foodOptions}
                      disabled={updateDevice.isPending}
                    />
                  </FormField>
                );
              })}
            </div>
          </FormShell>
        )}
      </CardContent>
      <DiscardUnsavedDialog {...discardConfirm} />
    </Card>
  );
};

export default FeederFoodSection;
