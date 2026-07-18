import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import {
  FormActions,
  FormField,
  FormInlineDiscard,
  FormShell,
  Input,
} from '@/components/ui/form';
import { LoadingState } from '@/components/ui/PageState';
import { useDraftForm } from '@/hooks/form';
import { useFoods } from '@/hooks/queries/foodQueries';
import { addEvent } from '@/api/pets';
import type { DateRange } from '@/lib/utils';
import { Drumstick } from 'lucide-react';

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
  const foodDraftBaseline = React.useMemo(
    () => ({ selectedFoodId: null as number | null, amount: '' }),
    [],
  );
  const { draft, patchDraft, reset, requestDiscard, discardConfirm } =
    useDraftForm(foodDraftBaseline, {
      baselineKey: `${isOpen}-${petId}`,
    });
  const selectedFood =
    foods.find((food) => food.id === draft.selectedFoodId) ?? null;

  const addEventMutation = useMutation({
    mutationFn: (input: Parameters<typeof addEvent>[0]) => addEvent(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['petEvents', petId, dateRange],
      });
      queryClient.invalidateQueries({
        queryKey: ['waterTrends', petId],
      });
      reset();
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(draft.amount);
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
    requestDiscard(onClose);
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

        <FormShell
          onSubmit={handleSubmit}
          className="log-food-form"
          error={
            addEventMutation.isError
              ? addEventMutation.error instanceof Error
                ? addEventMutation.error.message
                : 'Failed to log food'
              : null
          }
          actionsSlot={
            discardConfirm.open ? (
              <FormInlineDiscard
                keepLabel={t('common.keep_editing')}
                discardLabel={t('common.discard')}
                onKeepEditing={discardConfirm.onCancel}
                onDiscard={discardConfirm.onConfirm}
                disabled={addEventMutation.isPending}
              />
            ) : (
              <FormActions
                onCancel={handleClose}
                cancelLabel={t('settings.cancel')}
                submitLabel={t('overview.log_food')}
                isSubmitting={addEventMutation.isPending}
                submitDisabled={
                  !selectedFood ||
                  !draft.amount ||
                  parseFloat(draft.amount) <= 0
                }
              />
            )
          }
        >
          <FormField label={t('settings.foods')}>
            <div className="log-food-list">
              {isLoadingFoods && <LoadingState message={t('common.loading')} />}
              {!isLoadingFoods && foods.length === 0 && (
                <p className="log-food-empty">
                  {t('settings.add_food_desc')}{' '}
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
                    onClick={() => {
                      const isDeselecting = selectedFood?.id === food.id;
                      patchDraft({
                        selectedFoodId: isDeselecting ? null : food.id,
                        amount:
                          !isDeselecting && food.serving_size_g != null
                            ? String(food.serving_size_g)
                            : '',
                      });
                    }}
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
            <FormField
              label={t('settings.food_serving_size_label')}
              htmlFor="log-food-amount"
            >
              <Input
                id="log-food-amount"
                type="number"
                min={0.1}
                step={0.1}
                value={draft.amount}
                onChange={(e) => patchDraft({ amount: e.target.value })}
                placeholder={t('settings.food_serving_size_placeholder')}
                required
              />
            </FormField>
          )}
        </FormShell>
      </DialogContent>
    </Dialog>
  );
};

export default LogFoodModal;
