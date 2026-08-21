import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { GetFoodDTO } from 'shared';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { kcalForAmount } from '@/components/food-picker/foodGroups';
import { KcalBandMeter } from './KcalBandMeter';
import { buildPortionScale } from './portionScale';
import './AmountStep.css';

interface AmountStepProps {
  food: GetFoodDTO;
  petName: string;
  /** Preloaded from what this cat was last fed of this food. */
  initialAmount: number;
  todayKcal: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  onSubmit: (amount: number) => void;
  isSubmitting: boolean;
}

/**
 * The last rung: how much. The value is the headline and is tappable for a
 * typed amount; the slider carries the pouch landmarks; the calorie rows say
 * what the log does to the day.
 */
const AmountStep: React.FC<AmountStepProps> = ({
  food,
  petName,
  initialAmount,
  todayKcal,
  lowerBound,
  upperBound,
  onSubmit,
  isSubmitting,
}) => {
  const { t } = useTranslation();
  const [amount, setAmount] = React.useState(initialAmount);
  const [typing, setTyping] = React.useState(false);
  const [typed, setTyped] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  const scale = React.useMemo(
    () => buildPortionScale(food.serving_size_g),
    [food.serving_size_g],
  );

  const kcal = kcalForAmount(food, amount);

  const commitTyped = () => {
    const parsed = Number.parseFloat(typed);
    if (Number.isFinite(parsed) && parsed > 0) {
      setAmount(Math.round(parsed));
    }
    setTyping(false);
  };

  const startTyping = () => {
    setTyped(String(amount));
    setTyping(true);
  };

  React.useEffect(() => {
    if (typing) inputRef.current?.select();
  }, [typing]);

  const detentLabels = React.useMemo(() => {
    const labels = new Map(scale.labels);
    if (scale.pouchLabelValue != null) {
      labels.set(scale.pouchLabelValue, t('log_food.pouch_full'));
    }
    return labels;
  }, [scale, t]);

  return (
    <div className="amount-step">
      <div className="amount-value">
        {typing ? (
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={1}
            className="amount-value-input"
            aria-label={t('log_food.amount_input_label')}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onBlur={commitTyped}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitTyped();
              }
              if (e.key === 'Escape') setTyping(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="amount-value-button"
            onClick={startTyping}
          >
            {amount}
            <small>g</small>
          </button>
        )}
        {kcal != null && (
          <p className="amount-kcal">
            {t('log_food.kcal_approx', { kcal: Math.round(kcal) })}
          </p>
        )}
      </div>

      <Slider
        value={amount}
        min={0}
        /* The track is one pouch. A preloaded amount past it — a typed
           correction from last time — stretches the track rather than
           reporting a value the slider cannot represent. */
        max={Math.max(scale.max, amount)}
        step={1}
        detents={scale.detents}
        detentLabels={detentLabels}
        onValueChange={setAmount}
        label={t('log_food.amount_label')}
        valueText={
          kcal != null
            ? `${amount} g, ${t('log_food.kcal_approx', { kcal: Math.round(kcal) })}`
            : `${amount} g`
        }
      />

      {kcal != null && todayKcal != null && (
        <div className="amount-kcal-rows">
          <div className="amount-kcal-row">
            <span>{t('log_food.today_kcal', { pet: petName })}</span>
            <span className="amount-kcal-row-value">
              {t('log_food.kcal_value', { kcal: Math.round(todayKcal) })}
            </span>
          </div>
          <div className="amount-kcal-row">
            <span>{t('log_food.after_log')}</span>
            <span className="amount-kcal-row-value">
              {t('log_food.kcal_value', {
                kcal: Math.round(todayKcal + kcal),
              })}
            </span>
          </div>
          {lowerBound != null && upperBound != null && (
            <KcalBandMeter
              todayKcal={todayKcal}
              deltaKcal={kcal}
              lowerBound={lowerBound}
              upperBound={upperBound}
            />
          )}
        </div>
      )}

      <Button
        className="amount-submit"
        onClick={() => onSubmit(amount)}
        disabled={amount <= 0 || isSubmitting}
      >
        {t('log_food.submit', { amount })}
      </Button>
    </div>
  );
};

export { AmountStep, type AmountStepProps };
