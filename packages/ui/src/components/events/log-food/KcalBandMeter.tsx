import * as React from 'react';
import { useTranslation } from 'react-i18next';
import './KcalBandMeter.css';

interface KcalBandMeterProps {
  /** Calories already logged today. */
  todayKcal: number;
  /** What this log would add. */
  deltaKcal: number;
  lowerBound: number;
  upperBound: number;
}

/**
 * Where today lands against the daily range, read off the bar rather than
 * written out: today's calories in primary, this log's addition glued on in
 * amber with a flat seam, over a track whose band zone is tinted. Below,
 * within and above are all the same picture — no verdict sentence.
 */
const KcalBandMeter: React.FC<KcalBandMeterProps> = ({
  todayKcal,
  deltaKcal,
  lowerBound,
  upperBound,
}) => {
  const { t } = useTranslation();
  const after = todayKcal + deltaKcal;
  /* Headroom past the band so a normal day never pins the bar to the end and
     an over-target day still shows how far over it went. */
  const scaleMax = Math.max(upperBound * 1.25, after * 1.05, 1);
  const pct = (value: number) => `${Math.min(100, (value / scaleMax) * 100)}%`;

  return (
    <div className="kcal-band-meter">
      <div
        className="kcal-band-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={Math.round(scaleMax)}
        aria-valuenow={Math.round(after)}
        aria-label={t('log_food.band_meter_label')}
        aria-valuetext={t('log_food.band_valuetext', {
          after: Math.round(after),
          low: Math.round(lowerBound),
          high: Math.round(upperBound),
        })}
      >
        <span
          className="kcal-band-zone"
          style={{
            left: pct(lowerBound),
            width: `${Math.max(0, ((upperBound - lowerBound) / scaleMax) * 100)}%`,
          }}
        />
        <span className="kcal-band-today" style={{ width: pct(todayKcal) }} />
        <span
          className="kcal-band-delta"
          style={{ left: pct(todayKcal), width: pct(deltaKcal) }}
        />
      </div>
      {/* Band edges are notches under the bar, the same grammar the amount
          slider uses — a line drawn across the fill would read as intake. */}
      <div className="kcal-band-ticks" aria-hidden="true">
        <span className="kcal-band-tick" style={{ left: pct(lowerBound) }} />
        <span className="kcal-band-tick" style={{ left: pct(upperBound) }} />
        <span className="kcal-band-label" style={{ left: pct(lowerBound) }}>
          {Math.round(lowerBound)}
        </span>
        <span className="kcal-band-label" style={{ left: pct(upperBound) }}>
          {Math.round(upperBound)}
        </span>
      </div>
    </div>
  );
};

export { KcalBandMeter, type KcalBandMeterProps };
