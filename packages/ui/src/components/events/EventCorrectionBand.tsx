import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

interface EventCorrectionBandProps {
  /**
   * `guess` states what the machine concluded and offers both answers;
   * `assign` states that it could not conclude and offers only the one.
   */
  variant: 'guess' | 'assign';
  /** The subject of the guess — bolded inside the sentence. */
  subject?: string;
  /** How the subject was arrived at, e.g. "by weight" / "from the camera". */
  basis?: string;
  onVerify: () => void;
  onFix: () => void;
  isBusy?: boolean;
}

/**
 * The one question the surface asks.
 *
 * Every guess the machine made is gathered here and asked once: everything
 * else on the surface is plain, inert reading. Answering either way is
 * terminal — the band never comes back, and a late correction goes through the
 * overflow menu instead.
 *
 * An `info` Callout, not a warning: a guess that wants confirming is a quiet
 * aside on a reading surface. What the two variants change is the glyph — the
 * sparkle for something concluded, the triangle for something it gave up on.
 */
const EventCorrectionBand: React.FC<EventCorrectionBandProps> = ({
  variant,
  subject,
  basis,
  onVerify,
  onFix,
  isBusy = false,
}) => {
  const { t } = useTranslation();

  return (
    <Callout
      tone="info"
      icon={
        variant === 'guess' ? (
          <Sparkles size={18} />
        ) : (
          <TriangleAlert size={18} />
        )
      }
      actions={
        <>
          {variant === 'guess' && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onVerify}
              disabled={isBusy}
            >
              <Check size={15} aria-hidden />
              {t('event_details.looks_right')}
            </Button>
          )}
          <Button
            type="button"
            variant="neutral"
            size="sm"
            onClick={onFix}
            disabled={isBusy}
          >
            {/* One destination, one word for it. An unassigned event and a
                wrongly-matched one are corrected on the same form, so calling
                the button something else here only implied a second place to
                go. */}
            {t('event_details.fix')}
          </Button>
        </>
      }
    >
      {variant === 'assign' ? (
        t('event_details.band_unassigned')
      ) : (
        <>
          {t('event_details.band_matched_to')} <b>{subject}</b>
          {basis ? ` ${basis}` : ''}
        </>
      )}
    </Callout>
  );
};

export default EventCorrectionBand;
