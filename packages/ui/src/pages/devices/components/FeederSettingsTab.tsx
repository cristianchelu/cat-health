import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { UtensilsCrossed } from 'lucide-react';
import type { GetDeviceResponseDTO } from 'shared';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { MetaLine } from '@/components/ui/MetaLine';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { FormField, FormShell } from '@/components/ui/form';
import {
  DeviceModelRow,
  DeviceModelRowTile,
} from '@/components/devices/camera';
import { FoodPickerSheet } from '@/components/food-picker/FoodPickerSheet';
import {
  coarseFoodGroup,
  kcalPerKilogram,
} from '@/components/food-picker/foodGroups';
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

  const foodsById = React.useMemo(
    () => new Map(foods.map((food) => [food.id, food])),
    [foods],
  );

  const [pickerCompartment, setPickerCompartment] = React.useState<
    string | null
  >(null);

  /* Assigning only fills the field. The tab's one Save is what writes it —
     the same bargain every other section on this page makes. */
  const handleCompartmentChange = (
    compartmentId: string,
    foodId: number | null,
  ) => {
    patchDraft({
      foodAssignments: {
        ...draft.foodAssignments,
        [compartmentId]: foodId,
      },
    });
    setPickerCompartment(null);
  };

  const openCompartment =
    compartments.find((row) => row.id === pickerCompartment) ?? null;

  const compartmentLabel = (
    compartment: (typeof compartments)[number],
  ): string =>
    compartment.labelKey === 'devices.feeder.food_compartment_numbered'
      ? t(compartment.labelKey, { number: compartment.id })
      : t(compartment.labelKey);

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
                const current = draft.foodAssignments[compartment.id];
                const food =
                  current != null ? (foodsById.get(current) ?? null) : null;
                const label = compartmentLabel(compartment);
                const density = food ? kcalPerKilogram(food) : null;

                return (
                  <FormField key={compartment.id} label={label}>
                    <DeviceModelRow
                      leading={
                        <DeviceModelRowTile
                          variant={food ? 'primary-lightest' : 'muted'}
                        >
                          <UtensilsCrossed aria-hidden="true" />
                        </DeviceModelRowTile>
                      }
                      title={
                        food
                          ? food.name
                          : t('devices.feeder.food_compartment_unlinked')
                      }
                      subtitle={
                        food ? (
                          <MetaLine
                            nowrap
                            parts={[
                              food.brand,
                              t(
                                `food_picker.group_${coarseFoodGroup(food.food_type)}_short`,
                              ),
                              density != null
                                ? t('food_picker.kcal_per_kg', {
                                    value: density,
                                  })
                                : null,
                            ]}
                          />
                        ) : (
                          t('devices.feeder.food_compartment_hint')
                        )
                      }
                      action={
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setPickerCompartment(compartment.id)}
                          disabled={updateDevice.isPending}
                          /* On a multi-bowl feeder every button says the same
                             word, so the name has to carry which bowl it
                             belongs to. On a single-bowl one there is nothing
                             to tell apart, and naming it would only produce
                             "Change the food in Food". */
                          aria-label={
                            compartments.length > 1
                              ? t(
                                  food
                                    ? 'devices.feeder.food_compartment_change_aria'
                                    : 'devices.feeder.food_compartment_choose_aria',
                                  { compartment: label },
                                )
                              : undefined
                          }
                        >
                          {t(
                            food
                              ? 'devices.feeder.food_compartment_change'
                              : 'devices.feeder.food_compartment_choose',
                          )}
                        </Button>
                      }
                    />
                  </FormField>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </FormShell>

      {/* Outside the form: the picker fills a field, it does not submit one. */}
      {openCompartment && (
        <FoodPickerSheet
          open
          onOpenChange={(next) => !next && setPickerCompartment(null)}
          title={compartmentLabel(openCompartment)}
          foods={foods}
          selectedFoodId={draft.foodAssignments[openCompartment.id] ?? null}
          noneLabel={t('devices.feeder.food_compartment_unlinked')}
          noneHint={t('devices.feeder.food_compartment_none_desc')}
          onPick={(foodId) =>
            handleCompartmentChange(openCompartment.id, foodId)
          }
        />
      )}

      <DiscardUnsavedDialog {...discardConfirm} />
    </div>
  );
};

export default FeederSettingsTab;
