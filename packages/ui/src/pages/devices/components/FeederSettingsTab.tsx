import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { UtensilsCrossed } from 'lucide-react';
import type { GetDeviceResponseDTO } from 'shared';
import { Card, CardContent } from '@/components/ui/Card';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FormField, FormShell, Select } from '@/components/ui/form';
import { useDraftForm } from '@/hooks/form';
import { useFoods } from '@/hooks/queries/foodQueries';
import { useUpdateDevice } from '@/hooks/queries/deviceQueries';
import {
  mergeFeederFoodCompartmentsIntoConfig,
  readFeederFoodAssignments,
  resolveFeederFoodCompartments,
} from './feederFoodCompartmentsRegistry';
import './FeederSettingsTab.css';

interface FeederSettingsTabProps {
  device: GetDeviceResponseDTO;
  onDirtyChange?: (dirty: boolean) => void;
}

type FoodAssignments = Record<string, number | null>;

/**
 * Everything the feeder's Settings tab writes, in one draft.
 *
 * Keyed by section so a second section is a key here rather than a second
 * form: the tab commits once, and a section that grew its own Save would put
 * the user in front of two of them with no way to tell which owns what.
 */
interface FeederSettingsDraft {
  foodAssignments: FoodAssignments;
}

function foodOptionLabel(brand: string | null, name: string): string {
  const b = brand?.trim();
  return b ? `${b} — ${name}` : name;
}

/**
 * The feeder's Settings tab: one form, one commit row, the way the Camera tab
 * carries its source and capture sections under a single Save.
 */
const FeederSettingsTab: React.FC<FeederSettingsTabProps> = ({
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
   * tab reads as dirty forever — enabling Save and guarding navigation on a
   * form that is visually untouched.
   */
  const baseline = React.useMemo((): FeederSettingsDraft => {
    const stored = new Map(readFeederFoodAssignments(device.config));
    return {
      foodAssignments: Object.fromEntries(
        compartmentOrder.map((id) => [id, stored.get(id) ?? null]),
      ),
    };
  }, [device.config, compartmentOrder]);

  const baselineKey = JSON.stringify(baseline);
  const { draft, patchDraft, isDirty, commit, requestReset, discardConfirm } =
    useDraftForm(baseline, { baselineKey });

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
    patchDraft({
      foodAssignments: {
        ...draft.foodAssignments,
        [compartmentId]: value === '' ? null : Number.parseInt(value, 10),
      },
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isDirty) return;

    const config = mergeFeederFoodCompartmentsIntoConfig(
      device.config,
      new Map(Object.entries(draft.foodAssignments)),
      compartmentOrder,
    );
    updateDevice.mutate({ config }, { onSuccess: () => commit() });
  };

  /*
   * No form until there is something to edit, so the tab does not show a Save
   * with nothing behind it — the same call the Camera tab makes when there is
   * no camera to link.
   */
  if (isLoadingFoods || foods.length === 0) {
    return (
      <div className="feeder-settings-tab">
        <SectionHeader
          size="compact"
          className="first"
          icon={<UtensilsCrossed aria-hidden="true" />}
          subtitle={t('devices.feeder.food_compartment_settings_help')}
        >
          {t('devices.feeder.food_compartment_settings_title')}
        </SectionHeader>
        <Card>
          <CardContent>
            <p className="feeder-settings-muted">
              {isLoadingFoods ? (
                t('common.loading')
              ) : (
                <>
                  {t('devices.feeder.food_compartment_no_foods')}{' '}
                  <Link to="/settings">{t('settings.foods')}</Link>
                </>
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="feeder-settings-tab">
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
        <SectionHeader
          size="compact"
          className="first"
          icon={<UtensilsCrossed aria-hidden="true" />}
          subtitle={t('devices.feeder.food_compartment_settings_help')}
        >
          {t('devices.feeder.food_compartment_settings_title')}
        </SectionHeader>
        <Card>
          <CardContent>
            <div className="feeder-settings-compartments">
              {compartments.map((compartment) => {
                const label =
                  compartment.labelKey ===
                  'devices.feeder.food_compartment_numbered'
                    ? t(compartment.labelKey, { number: compartment.id })
                    : t(compartment.labelKey);
                const current = draft.foodAssignments[compartment.id];
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
          </CardContent>
        </Card>
      </FormShell>

      <DiscardUnsavedDialog {...discardConfirm} />
    </div>
  );
};

export default FeederSettingsTab;
