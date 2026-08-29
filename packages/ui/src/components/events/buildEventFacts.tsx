import {
  Activity,
  Clock,
  Droplets,
  DropletOff,
  Drumstick,
  GlassWater,
  House,
  Scale,
  Timer,
  Toilet,
  TriangleAlert,
  Wifi,
} from 'lucide-react';
import * as React from 'react';
import type {
  GetEventChildDTO,
  GetEventListItemDTO,
  LitterboxUseEliminationType,
} from 'shared';
import { ELIMINATION_KIND_ICONS } from './litterboxEventIcons';
import { gramsToKgInput } from './useLitterboxWeightEdit';

/** The visit's own glyph per kind; `both` and the blanks fall back to the box. */
const ELIMINATION_ICONS: Record<
  LitterboxUseEliminationType,
  React.ElementType
> = {
  urination: ELIMINATION_KIND_ICONS.urination,
  defecation: ELIMINATION_KIND_ICONS.defecation,
  both: Toilet,
  no_elimination: Toilet,
  unknown: Toilet,
};

const ELIMINATION_LABEL_KEYS: Record<LitterboxUseEliminationType, string> = {
  urination: 'overview.urination',
  defecation: 'overview.defecation',
  both: 'overview.both',
  no_elimination: 'overview.no_elimination',
  unknown: 'common.unknown',
};

/**
 * Three tones, and each one means something.
 *
 * Readings are `neutral`. They used to take the event's domain colour — every
 * glyph in a litterbox visit teal — which said the same thing five times and
 * left nothing for the one reading that actually wants the eye. The domain is
 * already on the timeline row and in the title; repeating it here is
 * decoration wearing the clothes of information.
 */
export type FactTone =
  | 'neutral'
  /** A reading that means look closer — the only coloured glyph in the row. */
  | 'alert'
  /** No tint at all: the glyph is already an image, like an avatar. */
  | 'identity';

export interface EventFact {
  key: string;
  /**
   * The rendered glyph, not a component: an event's subject is a cat's face,
   * and a face is not something a `LucideIcon` slot can hold.
   */
  glyph: React.ReactNode;
  tone: FactTone;
  /** The reading itself. `null` renders the absent state instead. */
  value: string | null;
  /** Trailing unit, smaller and lighter than the number it follows. */
  unit?: string;
  /** What the reading is — the quiet line under it. */
  label: string;
}

/** `1:12` for a minute-plus visit, `14` seconds below that — the design's two shapes. */
function formatDuration(seconds: number): { value: string; unit?: string } {
  if (seconds < 60) return { value: String(Math.round(seconds)), unit: 's' };
  const whole = Math.round(seconds);
  const mins = Math.floor(whole / 60);
  return { value: `${mins}:${String(whole % 60).padStart(2, '0')}` };
}

export interface BuildFactsOptions {
  event: GetEventListItemDTO;
  /** Child rows of the visit; the cat's weight is one of them. */
  children: GetEventChildDTO[] | undefined;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * What the sensors said about this event, in reading order.
 *
 * Only readings live here. Anything the machine guessed — which cat, which
 * kind of visit — belongs in the meta line and the correction band, so that
 * the body of the surface stays plain, inert reading.
 */
export function buildEventFacts({
  event,
  children,
  t,
}: BuildFactsOptions): EventFact[] {
  const data = event.data;

  switch (data.type) {
    case 'litterbox_use': {
      const weightChild = children?.find(
        (child) => child.data.type === 'weight_measurement',
      );
      const grams =
        weightChild?.data.type === 'weight_measurement'
          ? weightChild.data.weight
          : null;
      const duration = formatDuration(data.duration);
      const eliminationType = data.elimination_type ?? 'unknown';
      const EliminationGlyph = ELIMINATION_ICONS[eliminationType];
      return [
        /* What the visit was, as a reading in its own right rather than a
           clause appended to the time and place. */
        {
          key: 'elimination-type',
          glyph: <EliminationGlyph aria-hidden />,
          tone: 'neutral',
          value: t(ELIMINATION_LABEL_KEYS[eliminationType]),
          label: t('event_details.fact_type'),
        },
        /* Only when it happened. "No straining" is the ordinary case, and a
           slot that mostly says nothing-is-wrong trains you to skip the one
           time it does not. */
        ...(data.straining
          ? [
              {
                key: 'straining',
                glyph: <TriangleAlert aria-hidden />,
                tone: 'alert' as const,
                value: t('event_details.fact_straining_seen'),
                label: t('overview.straining'),
              },
            ]
          : []),
        {
          key: 'cat-weight',
          glyph: <Scale aria-hidden />,
          tone: 'neutral',
          value: grams == null ? null : gramsToKgInput(grams),
          unit: grams == null ? undefined : 'kg',
          label:
            grams == null
              ? t('event_details.fact_cat_weight_removed')
              : t('event_details.fact_cat_weight'),
        },
        {
          key: 'deposit',
          glyph: <Toilet aria-hidden />,
          tone: 'neutral',
          value: String(data.elimination_weight),
          unit: 'g',
          label: t('event_details.fact_deposit'),
        },
        {
          key: 'in-the-box',
          glyph: <Clock aria-hidden />,
          tone: 'neutral',
          value: duration.value,
          unit: duration.unit,
          label: t('event_details.fact_in_the_box'),
        },
      ];
    }

    case 'water_intake': {
      const facts: EventFact[] = [
        {
          key: 'drank',
          glyph: <GlassWater aria-hidden />,
          tone: 'neutral',
          value: String(data.amount),
          unit: 'ml',
          label: t('event_details.fact_drank'),
        },
      ];
      if (data.duration != null) {
        const duration = formatDuration(data.duration);
        facts.push({
          key: 'drinking',
          glyph: <Timer aria-hidden />,
          tone: 'neutral',
          value: duration.value,
          unit: duration.unit,
          label: t('event_details.fact_drinking'),
        });
      }
      // Only when some of the draw was thrown away — an untouched reading has
      // no filtering story to tell.
      if (data.excluded_amount != null && data.excluded_amount > 0) {
        facts.push({
          key: 'spilled',
          glyph: <DropletOff aria-hidden />,
          tone: 'neutral',
          value: String(data.excluded_amount),
          unit: 'ml',
          label: t('event_details.fact_spilled'),
        });
      }
      return facts;
    }

    case 'food_intake': {
      const facts: EventFact[] = [
        {
          key: 'eaten',
          glyph: <Drumstick aria-hidden />,
          tone: 'neutral',
          value: String(data.amount),
          unit: 'g',
          label: t(`event_details.fact_eaten_${data.food_type}`),
        },
      ];
      const kcal = data.nutrients?.calories;
      if (kcal != null) {
        facts.push({
          key: 'energy',
          glyph: <Activity aria-hidden />,
          tone: 'neutral',
          value: String(Math.round(kcal)),
          unit: 'kcal',
          label: t('event_details.fact_energy'),
        });
      }
      return facts;
    }

    case 'weight_measurement':
      return [
        {
          key: 'weight',
          glyph: <Scale aria-hidden />,
          tone: 'neutral',
          value: gramsToKgInput(data.weight),
          unit: 'kg',
          label: t('event_details.fact_weight'),
        },
      ];

    case 'litterbox_maintenance': {
      const facts: EventFact[] = [
        {
          key: 'maintenance',
          glyph: <Toilet aria-hidden />,
          tone: 'neutral',
          value: t(`event_details.maintenance_${data.maintenance_type}`),
          label: t('event_details.fact_maintenance'),
        },
      ];
      if (data.litter_amount != null) {
        facts.push({
          key: 'litter-amount',
          glyph: <Droplets aria-hidden />,
          tone: 'neutral',
          value: String(data.litter_amount),
          unit: 'g',
          label: t('event_details.fact_litter_amount'),
        });
      }
      return facts;
    }

    case 'device_connectivity':
      return [
        {
          key: 'state',
          glyph: <Wifi aria-hidden />,
          tone: 'neutral',
          value: t(`event_details.connectivity_${data.state}`),
          label: t('event_details.fact_connectivity'),
        },
      ];

    case 'pet_presence':
      return [
        {
          key: 'presence',
          glyph: <House aria-hidden />,
          tone: 'neutral',
          value: t(`event_details.presence_${data.state}`),
          label: t('event_details.fact_presence'),
        },
      ];

    default:
      return [];
  }
}
