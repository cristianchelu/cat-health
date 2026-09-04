import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  Cat,
  CircleHelp,
  CloudDrizzle,
  PawPrint,
  Trash2,
  Undo2,
  User,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  NON_PET_CAUSES,
  overrideWaterAmount,
  parseLitterboxUseEliminationType,
  type EventCauseDTO,
  type EventDataDTO,
  type GetEventChildDTO,
  type GetEventListItemDTO,
  type LitterboxUseEliminationType,
} from 'shared';
import { DialogDescription, DialogTitle } from '@/components/ui/Dialog';
import Avatar from '@/components/ui/Avatar';
import { Switch } from '@/components/ui/Switch';
import { Callout } from '@/components/ui/Callout';
import {
  AdaptiveSelect,
  SelectTriggerButton,
} from '@/components/ui/AdaptiveSelect';
import { SelectPage, type PickerOption } from '@/components/ui/SelectPage';
import { SheetPages } from '@/components/ui/SheetPages';
import { Button } from '@/components/ui/Button';
import { FormActions, FormError, FormField, Input } from '@/components/ui/form';
import { usePets } from '@/hooks/queries/petQueries';
import { useUpdateEvent } from '@/hooks/queries/eventQueries';
import { useFoods } from '@/hooks/queries/foodQueries';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import {
  attributionFromEvent,
  attributionFromSelectValue,
  attributionSelectValue,
  attributionToPatch,
  causeLabelKey,
} from '@/lib/eventAttribution';
import { intakeFoodType } from '@/components/food-picker/foodGroups';
import { FoodBrowsePage } from '@/components/food-picker/FoodBrowsePage';
import {
  browseStepKey,
  buildFoodBrowseTree,
  type BrowseStep,
} from '@/components/food-picker/foodLadder';
import {
  gramsToKgInput,
  MAX_WEIGHT_G,
  MIN_WEIGHT_G,
  parseKgInput,
  useLitterboxWeightEdit,
} from './useLitterboxWeightEdit';
import {
  FOOD_AMOUNT_RANGE_G,
  MeasureOutOfRangeError,
  parseAmountInput,
  requireAmount,
  WATER_AMOUNT_RANGE_ML,
  type EditableMeasure,
} from './eventMeasures';
import './EventEditForm.css';

const CAUSE_ICONS: Record<
  Exclude<EventCauseDTO, 'unknown' | 'pet'>,
  LucideIcon
> = {
  robot_vacuum: Bot,
  human: User,
  other_animal: PawPrint,
  environment: CloudDrizzle,
};

const ELIMINATION_TYPES: LitterboxUseEliminationType[] = [
  'urination',
  'defecation',
  'both',
  'no_elimination',
  'unknown',
];

const ELIMINATION_LABEL_KEYS: Record<LitterboxUseEliminationType, string> = {
  urination: 'overview.urination',
  defecation: 'overview.defecation',
  both: 'overview.both',
  no_elimination: 'overview.no_elimination',
  unknown: 'common.unknown',
};

const RANGE_ERROR_KEYS: Record<EditableMeasure, string> = {
  weight: 'event_details.weight_out_of_range',
  food: 'event_details.edit_food_out_of_range',
  water: 'event_details.edit_water_out_of_range',
};

export interface EventEditFormProps {
  event: GetEventListItemDTO;
  eventChildren: GetEventChildDTO[] | undefined;
  /** Back to the surface this opened from. */
  onClose: () => void;
  /**
   * Hands the host a way to step back one level, for Escape. Returns true when
   * this form swallowed it by closing a picker of its own, false when the whole
   * form is what should close.
   */
  registerBack?: (back: () => boolean) => void;
}

/**
 * One destination for every correction on an event.
 *
 * The three guesses travel together because a wrong cat usually means the rest
 * is suspect too, and the visit's weight joins them rather than earning its own
 * entry point — one edit per event, no per-value forms. Nothing commits on tap:
 * the explicit Cancel/Save pair is where the guardrails live.
 *
 * Every control here is the form grammar the Settings pages already use — one
 * label above one control, all at the same height. An earlier build gave each
 * field whichever control suited it best in isolation (avatar tiles, cause
 * chips, a segmented row, a bare input, a red text button) and the form came
 * out a collage: seven vocabularies, no two sharing a height, a radius, or a
 * way of showing what was selected.
 */
const EventEditForm: React.FC<EventEditFormProps> = ({
  event,
  eventChildren,
  onClose,
  registerBack,
}) => {
  const { t } = useTranslation();
  const { formatDateTime } = useFormatters();
  const { data: pets } = usePets();
  const { mutateAsync: updateEvent, isPending: isPatching } = useUpdateEvent();

  const isLitterbox = event.data.type === 'litterbox_use';
  const isFood = event.data.type === 'food_intake';
  const isWater = event.data.type === 'water_intake';
  const {
    weightGrams,
    saveWeight,
    isSaving: isSavingWeight,
  } = useLitterboxWeightEdit({ ...event, children: eventChildren });
  const { data: foods } = useFoods(isFood);

  const baselineAttribution = attributionSelectValue(
    attributionFromEvent(event),
  );
  const baselineType: LitterboxUseEliminationType =
    event.data.type === 'litterbox_use'
      ? (event.data.elimination_type ?? 'unknown')
      : 'unknown';
  const baselineStraining =
    event.data.type === 'litterbox_use'
      ? (event.data.straining ?? false)
      : false;
  const baselineWeight = weightGrams != null ? gramsToKgInput(weightGrams) : '';
  /* Food grams and water ml share one field: an event is only ever one kind. */
  const baselineAmount =
    event.data.type === 'food_intake' || event.data.type === 'water_intake'
      ? String(event.data.amount)
      : '';
  /* `null` is an answer — "no food row backs this meal" — not an unset field. */
  const baselineFoodId =
    event.data.type === 'food_intake' ? (event.data.food_id ?? null) : null;

  const [attribution, setAttribution] = React.useState(baselineAttribution);
  const [eliminationType, setEliminationType] = React.useState(baselineType);
  const [straining, setStraining] = React.useState(baselineStraining);
  const [weightKg, setWeightKg] = React.useState(baselineWeight);
  const [amountText, setAmountText] = React.useState(baselineAmount);
  const [foodId, setFoodId] = React.useState(baselineFoodId);
  const [reanalyze, setReanalyze] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  /* Which picker level the drawer is showing, or the form itself. */
  const [picker, setPicker] = React.useState<'cat' | 'type' | null>(null);
  /* The food ladder's rungs, while the drawer is inside it; empty otherwise.
     A stack rather than a flag because the ladder is the one picker here with
     more than one level to be on. */
  const [foodStack, setFoodStack] = React.useState<BrowseStep[]>([]);

  React.useEffect(() => {
    registerBack?.(() => {
      if (foodStack.length > 0) {
        setFoodStack((prev) => prev.slice(0, -1));
        return true;
      }
      if (!picker) return false;
      setPicker(null);
      return true;
    });
  }, [picker, foodStack.length, registerBack]);

  const isBusy = isPatching || isSavingWeight;
  const weightChanged = isLitterbox && weightKg !== baselineWeight;
  const weightRemoved = weightKg.trim() === '';
  /* Naming the number is what makes the arrow safe to press blind. With no
     stored reading to name, all it can promise is to undo what you typed. */
  const undoWeightLabel = baselineWeight
    ? t('event_details.restore_weight', { weight: baselineWeight })
    : t('event_details.undo_weight_change');

  /* Grams and millilitres are the same row with different clothes; only the
     label, the window and the unit change, so they live in one config rather
     than two copies of the JSX. */
  const amountField = isFood
    ? {
        label: t('event_details.edit_food_amount_label'),
        range: FOOD_AMOUNT_RANGE_G,
        unit: 'g',
      }
    : isWater
      ? {
          label: t('event_details.edit_water_amount_label'),
          range: WATER_AMOUNT_RANGE_ML,
          unit: 'ml',
        }
      : null;
  const amountChanged = amountField != null && amountText !== baselineAmount;
  const foodChanged = isFood && foodId !== baselineFoodId;
  /* A device amount is never absent, so the arrow always names the reading. */
  const undoAmountLabel = t('event_details.restore_amount', {
    amount: baselineAmount,
    unit: amountField?.unit ?? '',
  });

  /* What the correction leaves behind — computed by the same invariant the
     save will write, so the hint can never promise a different split than
     the one that lands. */
  const spillMl = (() => {
    if (event.data.type !== 'water_intake' || !amountChanged) return 0;
    if (event.data.raw_amount == null) return 0;
    const amount = parseAmountInput(amountText);
    if (amount == null) return 0;
    return overrideWaterAmount(event.data, amount).excluded_amount ?? 0;
  })();

  /**
   * Cats first, then the honest blank, then the ways an event happens without
   * one. The non-pet causes settle an event as finally as a cat does, so they
   * belong in the same list rather than behind a second control — a group
   * heading is enough to say they are a different kind of answer.
   */
  const attributionOptions: PickerOption[] = [
    ...(pets ?? []).map((pet) => ({
      value: `pet:${pet.id}`,
      label: pet.name,
      leading: (
        <Avatar
          size="sm"
          src={pet.avatar_url}
          alt=""
          fallbackIcon={<Cat size={16} aria-hidden />}
        />
      ),
    })),
    {
      value: 'unknown',
      label: t('event_details.edit_not_sure'),
      subline: t('event_details.edit_not_sure_hint'),
      /* An `Avatar` rather than a bare glyph so the blank keeps the column the
         faces above it occupy — otherwise its label starts further left than
         every other row's. */
      leading: (
        <Avatar
          size="sm"
          alt=""
          fallbackIcon={<CircleHelp size={16} aria-hidden />}
        />
      ),
    },
    ...NON_PET_CAUSES.map((cause) => {
      const Icon = CAUSE_ICONS[cause];
      return {
        value: cause,
        label: t(causeLabelKey(cause)),
        leading: <Icon size={16} aria-hidden />,
        group: t('event_details.edit_not_a_cat'),
      };
    }),
  ];

  /**
   * The corrected reading as the event's next `data`, or `undefined` when the
   * reading was not touched. Throws when the number is missing or out of its
   * window, before anything has been written.
   */
  const buildDataPatch = (): EventDataDTO | undefined => {
    if (event.data.type === 'litterbox_use') {
      return {
        ...event.data,
        elimination_type: eliminationType,
        straining,
        // The stored segments describe a different visit once the type
        // changes; the server re-runs them rather than keeping a lie.
        ...(eliminationType !== (event.data.elimination_type ?? 'unknown') && {
          segments: null,
        }),
      };
    }

    if (event.data.type === 'food_intake') {
      if (!amountChanged && !foodChanged) return undefined;
      const amount = requireAmount(amountText, FOOD_AMOUNT_RANGE_G, 'food');
      const base = { ...event.data, amount };
      if (!foodChanged) return base;
      const food =
        foodId != null ? foods?.find((f) => f.id === foodId) : undefined;
      if (food) {
        // The server recomputes nutrients and the moisture child from the row.
        return { ...base, food_id: food.id, food_type: intakeFoodType(food) };
      }
      // Unlinked on purpose: the old food's nutrition no longer speaks for
      // this meal, so it leaves with the link rather than being rescaled.
      const { food_id: _unlinked, nutrients: _stale, ...rest } = base;
      return { ...rest, food_type: 'unknown' };
    }

    if (event.data.type === 'water_intake') {
      if (!amountChanged) return undefined;
      const amount = requireAmount(amountText, WATER_AMOUNT_RANGE_ML, 'water');
      return overrideWaterAmount(event.data, amount);
    }

    return undefined;
  };

  const handleSave = async () => {
    setError(null);
    const grams = isLitterbox ? parseKgInput(weightKg) : null;

    try {
      // The data patch is built first and the weight saved second: both can
      // reject for range, and a rejected save must leave the whole form
      // untouched rather than half-applied.
      const dataPatch = buildDataPatch();
      if (weightChanged) {
        await saveWeight(grams, { reidentify: reanalyze });
      }

      const nextAttribution = attributionFromSelectValue(attribution);
      // Only a changed attribution is a decision. Restating the current one
      // would stamp `attributed_by: 'manual'` — relabelling a microchip event
      // "corrected by you" when all that moved was a number.
      const attributionChanged = attribution !== baselineAttribution;

      await updateEvent({
        eventId: event.id,
        data: {
          ...(attributionChanged && attributionToPatch(nextAttribution)),
          ...(dataPatch && { data: dataPatch }),
          human_verified: true,
        },
      });
      onClose();
    } catch (e) {
      setError(
        e instanceof MeasureOutOfRangeError
          ? t(RANGE_ERROR_KEYS[e.measure])
          : t('event_details.edit_save_failed'),
      );
    }
  };

  const typeOptions: PickerOption[] = ELIMINATION_TYPES.map((type) => ({
    value: type,
    label: t(ELIMINATION_LABEL_KEYS[type]),
  }));

  const selectedFood =
    isFood && foodId != null
      ? foods?.find((food) => food.id === foodId)
      : undefined;

  const foodTree = React.useMemo(
    () => buildFoodBrowseTree(foods ?? []),
    [foods],
  );
  const foodStep = foodStack.length
    ? foodStack[foodStack.length - 1]
    : undefined;

  /*
   * Every picker takes over the drawer rather than opening a sheet of its
   * own. Two sheets stacked at two heights is the shape this replaced; here
   * the drawer stays put and only its contents change. The flat pickers are
   * a `SelectPage` each; the food field walks its browse ladder the same way,
   * one `FoodBrowsePage` per rung.
   */
  const pickerLevel =
    picker === 'cat'
      ? {
          title: t('event_details.edit_cat_label'),
          options: attributionOptions,
          value: attribution,
          onSelect: setAttribution,
        }
      : picker === 'type'
        ? {
            title: t('event_details.edit_type_label'),
            options: typeOptions,
            value: eliminationType,
            onSelect: (next: string) => {
              const parsed = parseLitterboxUseEliminationType(next);
              if (parsed) setEliminationType(parsed);
            },
          }
        : null;

  return (
    <div className="event-edit-form">
      <SheetPages
        page={picker ?? (foodStep ? `food:${browseStepKey(foodStep)}` : 'form')}
        depth={picker ? 1 : foodStack.length}
      >
        {foodStep ? (
          <FoodBrowsePage
            step={foodStep}
            tree={foodTree}
            foods={foods ?? []}
            title={t('event_details.edit_food_label')}
            selectedFoodId={foodId}
            onPush={(next) => setFoodStack((prev) => [...prev, next])}
            onBack={() => setFoodStack((prev) => prev.slice(0, -1))}
            onPick={(next) => {
              setFoodId(next);
              /* Chosen, so all the way out — the rungs in between were the
                 way to the answer, not places to return through. */
              setFoodStack([]);
            }}
            noneLabel={t('event_details.edit_food_not_linked')}
            noneHint={t('event_details.edit_food_not_linked_hint')}
          />
        ) : pickerLevel ? (
          <SelectPage
            title={pickerLevel.title}
            options={pickerLevel.options}
            value={pickerLevel.value}
            onBack={() => setPicker(null)}
            onSelect={(next) => {
              pickerLevel.onSelect(next);
              setPicker(null);
            }}
          />
        ) : (
          <div className="event-edit-form-main">
            <div className="event-edit-header">
              <DialogTitle className="event-edit-title">
                {t('event_details.edit_event_title')}
              </DialogTitle>
              <DialogDescription className="event-edit-subtitle">
                {formatDateTime(new Date(event.timestamp))}
              </DialogDescription>
            </div>

            <div className="event-edit-body">
              <FormField label={t('event_details.edit_cat_label')}>
                <AdaptiveSelect
                  value={attribution}
                  onValueChange={setAttribution}
                  options={attributionOptions}
                  label={t('event_details.edit_cat_label')}
                  disabled={isBusy}
                  onOpenPage={() => setPicker('cat')}
                />
              </FormField>

              {isFood && (
                <FormField label={t('event_details.edit_food_label')}>
                  {/* Not a dropdown: the library is the browse ladder, walked
                      as levels of this same drawer. The trigger keeps the
                      select's shape so the form row reads like its peers. */}
                  <SelectTriggerButton
                    label={t('event_details.edit_food_label')}
                    text={
                      selectedFood?.name ??
                      t('event_details.edit_food_not_linked')
                    }
                    disabled={isBusy}
                    onClick={() => setFoodStack([{ kind: 'root' }])}
                  />
                </FormField>
              )}

              {/* The measurement, in this form's own grammar — one label, one
                  control at the shared height. Deliberately not the log
                  ladder's slider-and-headline `AmountStep`: that is the log
                  flow's vocabulary, and this form is not a collage. */}
              {amountField && (
                <FormField label={amountField.label}>
                  <div className="event-edit-measure">
                    <Input
                      type="number"
                      step="1"
                      min={amountField.range.min}
                      max={amountField.range.max}
                      value={amountText}
                      disabled={isBusy}
                      aria-label={amountField.label}
                      onChange={(e) => setAmountText(e.target.value)}
                    />
                    <span className="event-edit-measure-unit">
                      {amountField.unit}
                    </span>
                    {amountChanged && (
                      <Button
                        type="button"
                        variant="ghost"
                        icon
                        disabled={isBusy}
                        title={undoAmountLabel}
                        aria-label={undoAmountLabel}
                        onClick={() => setAmountText(baselineAmount)}
                      >
                        <Undo2 size={16} aria-hidden />
                      </Button>
                    )}
                  </div>

                  {/* The invariant's other half, said while it is about to be
                      written rather than discovered on the spill line later.
                      Rounded for reading only — visibility and the saved
                      split both use the exact value. */}
                  {spillMl > 0 && (
                    <p className="event-edit-measure-note">
                      {t('event_details.edit_water_spill_hint', {
                        amount: Math.round(spillMl * 100) / 100,
                      })}
                    </p>
                  )}
                </FormField>
              )}

              {isLitterbox && (
                <>
                  {/* Five plain words would be served fine by a native
                      `<select>` — but the cat above it opens a page, and one
                      form that speaks two interaction languages a few pixels
                      apart reads as two products. */}
                  <FormField label={t('event_details.edit_type_label')}>
                    <AdaptiveSelect
                      value={eliminationType}
                      onValueChange={(next) => {
                        const parsed = parseLitterboxUseEliminationType(next);
                        if (parsed) setEliminationType(parsed);
                      }}
                      options={typeOptions}
                      label={t('event_details.edit_type_label')}
                      disabled={isBusy}
                      onOpenPage={() => setPicker('type')}
                    />
                  </FormField>

                  <FormField label={t('event_details.edit_weight_label')}>
                    <div className="event-edit-measure">
                      <Input
                        type="number"
                        step="0.01"
                        min={MIN_WEIGHT_G / 1000}
                        max={MAX_WEIGHT_G / 1000}
                        value={weightKg}
                        disabled={isBusy}
                        aria-label={t('event_details.edit_weight_label')}
                        onChange={(e) => setWeightKg(e.target.value)}
                      />
                      <span className="event-edit-measure-unit">kg</span>
                      {/*
                       * One slot, two jobs. Untouched, it is the bin: clearing
                       * the field *is* the removal, so the control that does it
                       * belongs on the field rather than in a section further
                       * down with other questions in between.
                       *
                       * Edited — binned or typed over — it becomes the way back
                       * to the stored reading. The target is always the stored
                       * value rather than whatever was in the field a moment
                       * ago, which is both what you actually want back and what
                       * makes leaving by this route return the form to rest:
                       * the follow-up below keys off the same comparison and
                       * stands down with it.
                       */}
                      {weightChanged ? (
                        <Button
                          type="button"
                          variant="ghost"
                          icon
                          disabled={isBusy}
                          title={undoWeightLabel}
                          aria-label={undoWeightLabel}
                          onClick={() => setWeightKg(baselineWeight)}
                        >
                          <Undo2 size={16} aria-hidden />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          icon
                          className="event-edit-measure-remove"
                          disabled={isBusy || weightRemoved}
                          title={t('event_details.remove_weight')}
                          aria-label={t('event_details.remove_weight')}
                          onClick={() => setWeightKg('')}
                        >
                          <Trash2 size={16} aria-hidden />
                        </Button>
                      )}
                    </div>

                    {/* What removing costs, said only once it is what will
                        happen. */}
                    {weightRemoved && (
                      <p className="event-edit-measure-note">
                        {t('event_details.remove_weight_hint')}
                      </p>
                    )}

                    {/*
                     * Re-analysis is a consequence, not a standing field. It
                     * exists only once the weight actually changed, and sits
                     * with the field that caused it: cats are told apart by
                     * weight, so this one edit can re-identify every later
                     * visit on the device. A cat, type or straining edit never
                     * feeds identification and never raises it.
                     */}
                    {weightChanged && event.device_id != null && (
                      <Callout
                        tone="info"
                        className="event-edit-followup"
                        control={
                          <Switch
                            id="event-edit-reanalyze"
                            checked={reanalyze}
                            disabled={isBusy}
                            onCheckedChange={setReanalyze}
                          />
                        }
                      >
                        <label htmlFor="event-edit-reanalyze">
                          {t('event_details.reanalyze_later_visits')}
                          <small>
                            {t('event_details.reanalyze_later_visits_hint')}
                          </small>
                        </label>
                      </Callout>
                    )}
                  </FormField>

                  <div className="event-edit-switch-row">
                    <label htmlFor="event-edit-straining">
                      {t('event_details.straining_observed')}
                    </label>
                    <Switch
                      id="event-edit-straining"
                      checked={straining}
                      disabled={isBusy}
                      onCheckedChange={setStraining}
                    />
                  </div>
                </>
              )}

              <FormError message={error} />
            </div>

            <FormActions
              className="event-edit-actions"
              onCancel={onClose}
              cancelLabel={t('common.cancel')}
              submitLabel={t('common.save')}
              isSubmitting={isBusy}
              submitType="button"
              onSubmitClick={() => void handleSave()}
            />
          </div>
        )}
      </SheetPages>
    </div>
  );
};

export default EventEditForm;
