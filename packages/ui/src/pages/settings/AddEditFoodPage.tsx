import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useFood, useCreateFood, useUpdateFood } from '@/hooks/queries/foodQueries';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Button } from '@/components/ui/Button';
import { FormField, Input, Select, Textarea } from '@/components/ui/form';
import { Drumstick } from 'lucide-react';
import type { FoodTypeDTO } from 'shared';

import './AddEditFoodPage.css';

const FOOD_TYPE_VALUES: FoodTypeDTO[] = [
  'drink',
  'complete_wet',
  'complementary_wet',
  'treat',
  'complete_dry',
  'complementary_dry',
];

const AddEditFoodPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new' || id === undefined;
  const foodId = isNew ? 0 : Number(id);

  const { data: food, isLoading } = useFood(foodId, !isNew);
  const createFood = useCreateFood();
  const updateFoodMutation = useUpdateFood(foodId);

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [foodType, setFoodType] = useState<FoodTypeDTO>('complete_wet');
  const [barcodeEan13, setBarcodeEan13] = useState('');
  const [moisturePercent, setMoisturePercent] = useState('');
  const [caloriesPer100g, setCaloriesPer100g] = useState('');
  const [servingSizeG, setServingSizeG] = useState('');
  const [notes, setNotes] = useState('');
  const [nutrientsJson, setNutrientsJson] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (food) {
      setName(food.name);
      setBrand(food.brand ?? '');
      setFoodType(food.food_type);
      setBarcodeEan13(food.barcode_ean13 ?? '');
      setMoisturePercent(
        food.moisture_percent != null ? String(food.moisture_percent) : '',
      );
      setCaloriesPer100g(
        food.calories_per_100g != null ? String(food.calories_per_100g) : '',
      );
      setServingSizeG(
        food.serving_size_g != null ? String(food.serving_size_g) : '',
      );
      setNotes(food.notes ?? '');
      setNutrientsJson(
        food.nutrients
          ? JSON.stringify(food.nutrients, null, 2)
          : '{}',
      );
    }
  }, [food]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let nutrients: Record<string, number> | null = null;
    if (nutrientsJson.trim()) {
      try {
        const parsed = JSON.parse(nutrientsJson);
        if (parsed && typeof parsed === 'object') {
          nutrients = parsed;
        }
      } catch {
        setError(t('settings.food_invalid_nutrients_json'));
        return;
      }
    }

    try {
      const barcode =
        barcodeEan13.replace(/\D/g, '').length === 13
          ? barcodeEan13.replace(/\D/g, '')
          : null;
      const payload = {
        name,
        brand: brand || null,
        food_type: foodType,
        barcode_ean13: barcode,
        moisture_percent:
          moisturePercent !== ''
            ? parseFloat(moisturePercent)
            : null,
        calories_per_100g:
          caloriesPer100g !== ''
            ? parseFloat(caloriesPer100g)
            : null,
        serving_size_g:
          servingSizeG !== '' ? parseFloat(servingSizeG) : null,
        notes: notes || null,
        nutrients,
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

  if (!isNew && isLoading) {
    return (
      <div className="add-edit-food-page">
        <p>{t('common.loading_pets')}</p>
      </div>
    );
  }

  const isPending = createFood.isPending || updateFoodMutation.isPending;

  return (
    <div className="add-edit-food-page">
      <SectionHeader icon={<Drumstick size="1em" />}>
        {isNew ? t('settings.add_food_title') : t('settings.edit_food_title')}
      </SectionHeader>

      <form onSubmit={handleSubmit} className="settings-form">
        <FormField label={t('settings.food_name_label')}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('settings.food_name_placeholder')}
            required
          />
        </FormField>

        <FormField label={t('settings.food_brand_label')}>
          <Input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder={t('settings.food_brand_placeholder')}
          />
        </FormField>

        <FormField label={t('settings.food_type_label')}>
          <Select
            value={foodType}
            onChange={(e) => setFoodType(e.target.value as FoodTypeDTO)}
            options={FOOD_TYPE_VALUES.map((value) => ({
              value,
              label: t(`settings.food_type_${value}`),
            }))}
            required
          />
        </FormField>

        <FormField label={t('settings.food_barcode_label')}>
          <Input
            value={barcodeEan13}
            onChange={(e) => setBarcodeEan13(e.target.value.replace(/\D/g, '').slice(0, 13))}
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
            value={moisturePercent}
            onChange={(e) => setMoisturePercent(e.target.value)}
            placeholder={t('settings.food_moisture_placeholder')}
          />
        </FormField>

        <FormField label={t('settings.food_calories_label')}>
          <Input
            type="number"
            min={0}
            step={0.1}
            value={caloriesPer100g}
            onChange={(e) => setCaloriesPer100g(e.target.value)}
            placeholder={t('settings.food_calories_placeholder')}
          />
        </FormField>

        <FormField label={t('settings.food_serving_size_label')}>
          <Input
            type="number"
            min={0}
            step={1}
            value={servingSizeG}
            onChange={(e) => setServingSizeG(e.target.value)}
            placeholder={t('settings.food_serving_size_placeholder')}
          />
        </FormField>

        <FormField label={t('settings.food_notes_label')}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t('settings.food_notes_placeholder')}
          />
        </FormField>

        <FormField label={t('settings.food_nutrients_label')}>
          <Textarea
            value={nutrientsJson}
            onChange={(e) => setNutrientsJson(e.target.value)}
            rows={6}
            className="font-mono"
            placeholder='{"protein_percent": 12, "fat_percent": 5}'
          />
        </FormField>

        {error && <div className="error-message">{error}</div>}

        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/settings')}
          >
            {t('settings.cancel')}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? t('settings.saving')
              : isNew
                ? t('settings.food_create')
                : t('settings.save_changes')}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AddEditFoodPage;
