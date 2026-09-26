import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ControlValueType, SettingControl } from 'shared';
import { FoodPickerSheet } from '@/components/food-picker/FoodPickerSheet';
import { coarseFoodGroup } from '@/components/food-picker/foodGroups';
import { useFoods } from '@/hooks/queries/foodQueries';
import {
  resizeCompartments,
  type CompartmentsDraft,
} from '@/lib/deviceControlDraft';
import { controlLabel, resolveControlType } from '@/lib/deviceControlLabels';
import { CompartmentsField } from './CompartmentsField';

type CompartmentsType = Extract<ControlValueType, { kind: 'compartments' }>;

interface DeviceCompartmentsSettingProps {
  setting: SettingControl & { type: CompartmentsType };
  value: CompartmentsDraft;
  onChange: (next: CompartmentsDraft) => void;
  disabled?: boolean;
  /** Why the draft cannot be sent, already worded. */
  error?: string;
}

/**
 * Edits a compartmented setting in a draft: its layout, and per compartment a
 * food from the catalog and the numbers it takes. Draws tiles for the
 * caller's grid, and the food picker beside them.
 */
const DeviceCompartmentsSetting: React.FC<DeviceCompartmentsSettingProps> = ({
  setting,
  value,
  onChange,
  disabled,
  error,
}) => {
  const { t } = useTranslation();
  const { data: foods = [] } = useFoods();
  const [picking, setPicking] = React.useState<number | null>(null);

  const resolved = resolveControlType(setting.type, t);
  const layout =
    resolved.layouts.find((option) => option.value === value.layout) ??
    resolved.layouts[0];
  if (!layout) return null;

  const foodField = layout.fields.food;
  const pickable =
    foodField?.type.kind === 'food'
      ? foods.filter((food) =>
          (foodField.type.kind === 'food'
            ? foodField.type.groups
            : []
          ).includes(coarseFoodGroup(food.food_type)),
        )
      : [];
  const foodName = (id: unknown) =>
    typeof id === 'number'
      ? (foods.find((food) => food.id === id)?.name ?? null)
      : null;

  const patchCompartment = (
    index: number,
    patch: CompartmentsDraft['compartments'][number],
  ) =>
    onChange({
      ...value,
      compartments: value.compartments.map((compartment, i) =>
        i === index ? { ...compartment, ...patch } : compartment,
      ),
    });

  return (
    <>
      <CompartmentsField
        label={controlLabel(setting.label, t)}
        layouts={resolved.layouts}
        layout={layout}
        compartments={value.compartments}
        foodNames={value.compartments.map((compartment) =>
          foodName(compartment.food),
        )}
        onLayoutChange={(next) =>
          onChange(resizeCompartments(setting.type, value, next))
        }
        onPickFood={setPicking}
        onNumberChange={(index, field, text) =>
          patchCompartment(index, { [field]: text })
        }
        chooseFoodLabel={t('devices.controls.choose_food')}
        disabled={disabled}
        busyLabel={setting.pending ? t('devices.controls.pending') : undefined}
        error={
          error ??
          (setting.failed
            ? t(`devices.controls.failed.${setting.failed.reason}`)
            : undefined)
        }
      />
      <FoodPickerSheet
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        title={picking !== null ? (layout.compartments[picking] ?? '') : ''}
        foods={pickable}
        selectedFoodId={
          picking !== null
            ? ((value.compartments[picking]?.food as number | null) ?? null)
            : null
        }
        noneLabel={t('devices.feeder.food_compartment_unlinked')}
        noneHint={t('devices.feeder.food_compartment_none_desc')}
        onPick={(foodId) => {
          if (picking !== null) patchCompartment(picking, { food: foodId });
          setPicking(null);
        }}
      />
    </>
  );
};

export { DeviceCompartmentsSetting, type DeviceCompartmentsSettingProps };
