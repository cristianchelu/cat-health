import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  useFood,
  useCreateFood,
  useUpdateFood,
} from '@/hooks/queries/foodQueries';
import {
  FormField,
  FormShell,
  Input,
  Select,
  Textarea,
} from '@/components/ui/form';
import { SettingsFormPage } from '@/components/ui/SettingsFormPage';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { useAppForm, useUnsavedBlocker } from '@/hooks/form';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Drumstick } from 'lucide-react';
import type { FoodTypeDTO, NutrientNameDTO, NutrientUnitDTO } from 'shared';
import type { GetFoodDTO } from 'shared';

import './AddEditFoodPage.css';

const FOOD_TYPE_VALUES: FoodTypeDTO[] = [
  'drink',
  'complete_wet',
  'complementary_wet',
  'treat',
  'complete_dry',
  'complementary_dry',
];

const NUTRIENT_NAMES: NutrientNameDTO[] = [
  'protein',
  'fat',
  'fiber',
  'ash',
  'carbs',
  'calcium',
  'phosphorus',
  'taurine',
  'sodium',
  'omega3',
  'omega6',
];

const NUTRIENT_UNITS: NutrientUnitDTO[] = ['percent', 'g', 'mg'];

type NutrientEntry = {
  nutrient: NutrientNameDTO;
  unit: NutrientUnitDTO;
  value: number;
};

const DEFAULT_NUTRIENTS: NutrientEntry[] = NUTRIENT_NAMES.map((nutrient) => ({
  nutrient,
  unit: 'percent' as NutrientUnitDTO,
  value: 0,
}));

interface FoodFormValues {
  name: string;
  brand: string;
  food_type: FoodTypeDTO;
  barcode_ean13: string;
  moisture_percent: string;
  calories_per_100g: string;
  serving_size_g: string;
  notes: string;
  nutrients: NutrientEntry[];
}

const DEFAULT_FORM_VALUES: FoodFormValues = {
  name: '',
  brand: '',
  food_type: 'complete_wet',
  barcode_ean13: '',
  moisture_percent: '',
  calories_per_100g: '',
  serving_size_g: '',
  notes: '',
  nutrients: DEFAULT_NUTRIENTS,
};

function foodToFormValues(food: GetFoodDTO): FoodFormValues {
  const existing = Array.isArray(food.nutrients) ? food.nutrients : [];
  return {
    name: food.name,
    brand: food.brand ?? '',
    food_type: food.food_type,
    barcode_ean13: food.barcode_ean13 ?? '',
    moisture_percent:
      food.moisture_percent != null ? String(food.moisture_percent) : '',
    calories_per_100g:
      food.calories_per_100g != null ? String(food.calories_per_100g) : '',
    serving_size_g:
      food.serving_size_g != null ? String(food.serving_size_g) : '',
    notes: food.notes ?? '',
    nutrients: NUTRIENT_NAMES.map((nutrient) => {
      const found = existing.find((n) => n.nutrient === nutrient);
      return found
        ? {
            nutrient: found.nutrient as NutrientNameDTO,
            unit: found.unit as NutrientUnitDTO,
            value: found.value,
          }
        : { nutrient, unit: 'percent' as NutrientUnitDTO, value: 0 };
    }),
  };
}

const AddEditFoodPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new' || id === undefined;
  const foodId = isNew ? 0 : Number(id);

  const { data: food, isLoading } = useFood(foodId, !isNew);
  const createFood = useCreateFood();
  const updateFoodMutation = useUpdateFood(foodId);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { isDirty },
  } = useAppForm<FoodFormValues>({
    defaultValues: DEFAULT_FORM_VALUES,
    values: food ? foodToFormValues(food) : undefined,
  });
  const { blockerOpen, onConfirmLeave, onCancelLeave } =
    useUnsavedBlocker(isDirty);

  const [error, setError] = useState<string | null>(null);

  const nutrients = watch('nutrients');
  const barcodeEan13 = watch('barcode_ean13');
  const barcodeRegistration = register('barcode_ean13');

  const onFormSubmit = async (data: FoodFormValues) => {
    setError(null);
    try {
      const barcode =
        data.barcode_ean13.replace(/\D/g, '').length === 13
          ? data.barcode_ean13.replace(/\D/g, '')
          : null;
      const payload = {
        name: data.name,
        brand: data.brand || null,
        food_type: data.food_type,
        barcode_ean13: barcode,
        moisture_percent:
          data.moisture_percent !== ''
            ? parseFloat(data.moisture_percent)
            : null,
        calories_per_100g:
          data.calories_per_100g !== ''
            ? parseFloat(data.calories_per_100g)
            : null,
        serving_size_g:
          data.serving_size_g !== '' ? parseFloat(data.serving_size_g) : null,
        notes: data.notes || null,
        nutrients: data.nutrients.some((n) => n.value > 0)
          ? data.nutrients.filter((n) => n.value > 0)
          : null,
      };

      if (isNew) {
        await createFood.mutateAsync(payload);
        navigate('/settings');
      } else {
        await updateFoodMutation.mutateAsync(payload);
        navigate('/settings');
      }
    } catch (err) {
      console.error(err);
      setError(
        isNew
          ? t('settings.food_create_error')
          : t('settings.food_update_error'),
      );
    }
  };

  const isPending = createFood.isPending || updateFoodMutation.isPending;

  return (
    <SettingsFormPage
      className="add-edit-food-page"
      title={
        isNew ? t('settings.add_food_title') : t('settings.edit_food_title')
      }
      icon={<Drumstick size="1em" />}
      isLoading={!isNew && isLoading}
      loadingMessage={t('common.loading_pets')}
    >
      <FormShell
        onSubmit={handleSubmit(onFormSubmit)}
        error={error}
        actions={{
          onCancel: () => navigate('/settings'),
          cancelLabel: t('settings.cancel'),
          submitLabel: isPending
            ? t('settings.saving')
            : isNew
              ? t('settings.food_create')
              : t('settings.save_changes'),
          isSubmitting: isPending,
          submitDisabled: !isDirty,
        }}
      >
        <Tabs defaultValue="basic" className="add-edit-food-tabs">
          <TabsList>
            <TabsTrigger value="basic">
              {t('settings.food_tab_basic')}
            </TabsTrigger>
            <TabsTrigger value="nutrients">
              {t('settings.food_tab_nutrients')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="add-edit-food-tab-content">
            <FormField label={t('settings.food_name_label')}>
              <Input
                {...register('name', { required: true })}
                placeholder={t('settings.food_name_placeholder')}
                required
              />
            </FormField>

            <FormField label={t('settings.food_brand_label')}>
              <Input
                {...register('brand')}
                placeholder={t('settings.food_brand_placeholder')}
              />
            </FormField>

            <FormField label={t('settings.food_type_label')}>
              <Select
                {...register('food_type', { required: true })}
                options={FOOD_TYPE_VALUES.map((value) => ({
                  value,
                  label: t(`settings.food_type_${value}`),
                }))}
                required
              />
            </FormField>

            <FormField label={t('settings.food_barcode_label')}>
              <Input
                {...barcodeRegistration}
                value={barcodeEan13}
                onChange={(e) => {
                  const next = e.target.value.replace(/\D/g, '').slice(0, 13);
                  setValue('barcode_ean13', next, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
                placeholder={t('settings.food_barcode_placeholder')}
                inputMode="numeric"
                maxLength={13}
              />
            </FormField>

            <FormField label={t('settings.food_moisture_label')}>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                {...register('moisture_percent')}
                placeholder={t('settings.food_moisture_placeholder')}
              />
            </FormField>

            <FormField label={t('settings.food_calories_label')}>
              <Input
                type="number"
                min={0}
                step={0.1}
                {...register('calories_per_100g')}
                placeholder={t('settings.food_calories_placeholder')}
              />
            </FormField>

            <FormField label={t('settings.food_serving_size_label')}>
              <Input
                type="number"
                min={0}
                step={1}
                {...register('serving_size_g')}
                placeholder={t('settings.food_serving_size_placeholder')}
              />
            </FormField>

            <FormField label={t('settings.food_notes_label')}>
              <Textarea
                {...register('notes')}
                rows={2}
                placeholder={t('settings.food_notes_placeholder')}
              />
            </FormField>
          </TabsContent>

          <TabsContent value="nutrients" className="add-edit-food-tab-content">
            <div className="nutrients-section">
              <FormField label={t('settings.food_nutrients_label')}>
                <div className="nutrients-list">
                  {nutrients.map((entry, index) => (
                    <div key={entry.nutrient} className="nutrient-entry">
                      <span className="nutrient-label">
                        {t(`settings.nutrient_name_${entry.nutrient}`)}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        step={0.1}
                        {...register(`nutrients.${index}.value`, {
                          valueAsNumber: true,
                        })}
                        className="nutrient-value-input"
                      />
                      <Select
                        {...register(`nutrients.${index}.unit`)}
                        options={NUTRIENT_UNITS.map((value) => ({
                          value,
                          label: t(`settings.nutrient_unit_${value}`),
                        }))}
                      />
                    </div>
                  ))}
                </div>
              </FormField>
            </div>
          </TabsContent>
        </Tabs>
      </FormShell>
      <DiscardUnsavedDialog
        open={blockerOpen}
        onConfirm={onConfirmLeave}
        onCancel={onCancelLeave}
      />
    </SettingsFormPage>
  );
};

export default AddEditFoodPage;
