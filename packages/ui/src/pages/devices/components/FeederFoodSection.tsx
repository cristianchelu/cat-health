import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { GetDeviceResponseDTO } from 'shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { FormField, Select } from '@/components/ui/form';
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
}

function foodOptionLabel(brand: string | null, name: string): string {
  const b = brand?.trim();
  return b ? `${b} — ${name}` : name;
}

const FeederFoodSection: React.FC<FeederFoodSectionProps> = ({ device }) => {
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

  const [assignments, setAssignments] = React.useState<Map<string, number | null>>(
    () => readFeederFoodAssignments(device.config),
  );

  React.useEffect(() => {
    setAssignments(readFeederFoodAssignments(device.config));
  }, [device.config]);

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

  const persistAssignments = React.useCallback(
    async (next: Map<string, number | null>) => {
      const config = mergeFeederFoodCompartmentsIntoConfig(
        device.config,
        next,
        compartmentOrder,
      );
      await updateDevice.mutateAsync({ config });
    },
    [compartmentOrder, device.config, updateDevice],
  );

  const handleCompartmentChange = (compartmentId: string, value: string) => {
    const next = new Map(assignments);
    next.set(compartmentId, value === '' ? null : Number.parseInt(value, 10));
    setAssignments(next);
    void persistAssignments(next);
  };

  return (
    <Card className="feeder-food-section">
      <CardHeader>
        <CardTitle>{t('devices.feeder.food_compartment_settings_title')}</CardTitle>
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
          <div className="feeder-food-section-compartments">
            {compartments.map((compartment) => {
              const label =
                compartment.labelKey === 'devices.feeder.food_compartment_numbered'
                  ? t(compartment.labelKey, { number: compartment.id })
                  : t(compartment.labelKey);
              const current = assignments.get(compartment.id);
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
        )}

        {updateDevice.isError && (
          <p className="feeder-food-section-error" role="alert">
            {t('devices.feeder.food_compartment_save_error')}
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default FeederFoodSection;
