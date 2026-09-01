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
  parseLitterboxUseEliminationType,
  type EventCauseDTO,
  type GetEventChildDTO,
  type GetEventListItemDTO,
  type LitterboxUseEliminationType,
} from 'shared';
import { DialogDescription, DialogTitle } from '@/components/ui/Dialog';
import Avatar from '@/components/ui/Avatar';
import { Switch } from '@/components/ui/Switch';
import { Callout } from '@/components/ui/Callout';
import { AdaptiveSelect } from '@/components/ui/AdaptiveSelect';
import { SelectPage, type PickerOption } from '@/components/ui/SelectPage';
import { SheetPages } from '@/components/ui/SheetPages';
import { Button } from '@/components/ui/Button';
import { FormActions, FormError, FormField, Input } from '@/components/ui/form';
import { usePets } from '@/hooks/queries/petQueries';
import { useUpdateEvent } from '@/hooks/queries/eventQueries';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import {
  attributionFromEvent,
  attributionFromSelectValue,
  attributionSelectValue,
  attributionToPatch,
  causeLabelKey,
} from '@/lib/eventAttribution';
import {
  gramsToKgInput,
  MAX_WEIGHT_G,
  MIN_WEIGHT_G,
  parseKgInput,
  useLitterboxWeightEdit,
  WeightOutOfRangeError,
} from './useLitterboxWeightEdit';
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
  const {
    weightGrams,
    saveWeight,
    isSaving: isSavingWeight,
  } = useLitterboxWeightEdit({ ...event, children: eventChildren });

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

  const [attribution, setAttribution] = React.useState(baselineAttribution);
  const [eliminationType, setEliminationType] = React.useState(baselineType);
  const [straining, setStraining] = React.useState(baselineStraining);
  const [weightKg, setWeightKg] = React.useState(baselineWeight);
  const [reanalyze, setReanalyze] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  /* Which picker level the drawer is showing, or the form itself. */
  const [picker, setPicker] = React.useState<'cat' | 'type' | null>(null);

  React.useEffect(() => {
    registerBack?.(() => {
      if (!picker) return false;
      setPicker(null);
      return true;
    });
  }, [picker, registerBack]);

  const isBusy = isPatching || isSavingWeight;
  const weightChanged = isLitterbox && weightKg !== baselineWeight;
  const weightRemoved = weightKg.trim() === '';
  /* Naming the number is what makes the arrow safe to press blind. With no
     stored reading to name, all it can promise is to undo what you typed. */
  const undoWeightLabel = baselineWeight
    ? t('event_details.restore_weight', { weight: baselineWeight })
    : t('event_details.undo_weight_change');

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

  const handleSave = async () => {
    setError(null);
    const grams = isLitterbox ? parseKgInput(weightKg) : null;

    try {
      // The weight goes first: it can be rejected for range, and a rejected
      // save must leave the whole form untouched rather than half-applied.
      if (weightChanged) {
        await saveWeight(grams, { reidentify: reanalyze });
      }

      const nextAttribution = attributionFromSelectValue(attribution);
      const litterboxPatch =
        event.data.type === 'litterbox_use'
          ? {
              ...event.data,
              elimination_type: eliminationType,
              straining,
              // The stored segments describe a different visit once the type
              // changes; the server re-runs them rather than keeping a lie.
              ...(eliminationType !==
                (event.data.elimination_type ?? 'unknown') && {
                segments: null,
              }),
            }
          : undefined;

      await updateEvent({
        eventId: event.id,
        data: {
          ...attributionToPatch(nextAttribution),
          ...(litterboxPatch && { data: litterboxPatch }),
          human_verified: true,
        },
      });
      onClose();
    } catch (e) {
      setError(
        e instanceof WeightOutOfRangeError
          ? t('event_details.weight_out_of_range')
          : t('event_details.edit_save_failed'),
      );
    }
  };

  const typeOptions: PickerOption[] = ELIMINATION_TYPES.map((type) => ({
    value: type,
    label: t(ELIMINATION_LABEL_KEYS[type]),
  }));

  /*
   * The picker takes over the drawer rather than opening one of its own. Two
   * sheets stacked at two heights is the shape this replaced; here the drawer
   * stays put and only its contents change.
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
      <SheetPages page={picker ?? 'form'} depth={picker ? 1 : 0}>
        {pickerLevel ? (
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
                    <div className="event-edit-weight">
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
                      <span className="event-edit-weight-unit">kg</span>
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
                          className="event-edit-weight-remove"
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
                      <p className="event-edit-weight-note">
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
