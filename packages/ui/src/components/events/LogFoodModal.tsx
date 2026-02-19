import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField, Input } from '@/components/ui/form';
import { useFoods } from '@/hooks/queries/foodQueries';
import { addEvent } from '@/api/pets';
import type { GetFoodDTO } from 'shared';
import type { DateRange } from '@/lib/utils';
import { Drumstick, Loader2 } from 'lucide-react';

import './LogFoodModal.css';

interface LogFoodModalProps {
  isOpen: boolean;
  onClose: () => void;
  petId: number;
  dateRange: DateRange;
}

const LogFoodModal: React.FC<LogFoodModalProps> = ({
  isOpen,
  onClose,
  petId,
  dateRange,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: foods = [], isLoading: isLoadingFoods } = useFoods();

  const [selectedFood, setSelectedFood] = React.useState<GetFoodDTO | null>(
    null,
  );
  const [amount, setAmount] = React.useState('');

  const addEventMutation = useMutation({
    mutationFn: (input: Parameters<typeof addEvent>[0]) => addEvent(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['petEvents', petId, dateRange],
      });
      queryClient.invalidateQueries({
        queryKey: ['waterTrends', petId],
      });
      onClose();
      setSelectedFood(null);
      setAmount('');
    },
  });

  React.useEffect(() => {
    if (selectedFood?.serving_size_g != null && amount === '') {
      setAmount(String(selectedFood.serving_size_g));
    }
  }, [selectedFood?.id, selectedFood?.serving_size_g, amount]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (Number.isNaN(amountNum) || amountNum <= 0) return;

    const foodType =
      selectedFood?.food_type === 'treat'
        ? 'treat'
        : selectedFood?.food_type === 'complete_dry' ||
            selectedFood?.food_type === 'complementary_dry'
          ? 'dry'
          : selectedFood?.food_type === 'drink' ||
              selectedFood?.food_type === 'complete_wet' ||
              selectedFood?.food_type === 'complementary_wet'
            ? 'wet'
            : 'unknown';

    addEventMutation.mutate({
      parent_event_id: null,
      pet_id: petId,
      device_id: null,
      human_verified: true,
      data: {
        type: 'food_intake',
        food_type: foodType,
        amount: amountNum,
        ...(selectedFood?.id != null && { food_id: selectedFood.id }),
      },
    });
  };

  const handleClose = () => {
    setSelectedFood(null);
    setAmount('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="log-food-modal-content">
        <DialogHeader>
          <DialogTitle className="log-food-modal-title">
            <Drumstick size="1.25em" />
            {t('overview.log_food')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="log-food-form">
          <FormField label={t('settings.foods')}>
            <div className="log-food-list">
              {isLoadingFoods && (
                <div className="log-food-loading">
                  <Loader2 className="animate-spin" size={24} />
                </div>
              )}
              {!isLoadingFoods && foods.length === 0 && (
                <p className="log-food-empty">
                  {t('settings.add_food_desc')}
                  {' '}
                  <Link to="/settings">{t('settings.foods')}</Link>
                </p>
              )}
              {!isLoadingFoods &&
                foods.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    className={`log-food-item ${
                      selectedFood?.id === food.id ? 'selected' : ''
                    }`}
                    onClick={() =>
                      setSelectedFood(selectedFood?.id === food.id ? null : food)
                    }
                  >
                    <span className="log-food-item-name">{food.name}</span>
                    {food.brand && (
                      <span className="log-food-item-brand">{food.brand}</span>
                    )}
                    <span className="log-food-item-type">
                      {t(`settings.food_type_${food.food_type}`)}
                    </span>
                  </button>
                ))}
            </div>
          </FormField>

          {selectedFood && (
            <FormField label={t('settings.food_serving_size_label')}>
              <Input
                type="number"
                min={0.1}
                step={0.1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t('settings.food_serving_size_placeholder')}
                required
              />
            </FormField>
          )}

          {addEventMutation.isError && (
            <div className="log-food-error">
              {addEventMutation.error instanceof Error
                ? addEventMutation.error.message
                : 'Failed to log food'}
            </div>
          )}

          <div className="log-food-actions">
            <Button type="button" variant="secondary" onClick={handleClose}>
              {t('settings.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                addEventMutation.isPending ||
                !selectedFood ||
                !amount ||
                parseFloat(amount) <= 0
              }
            >
              {addEventMutation.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                t('overview.log_food')
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LogFoodModal;
