import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { SureFeederState } from 'shared';
import { DashboardTile } from '@/components/layout/DashboardTile';
import { ResponsiveTileGrid } from '@/components/layout/ResponsiveTileGrid';
import { EntitySensor } from '@/components/devices/entities/EntitySensor';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  coerceEpochDate,
  formatRelativeTimeAgo,
} from '@/lib/formatRelativeTime';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import SureFeederStatus from './SureFeederStatus';
import {
  formatCloseDelay,
  formatFoodTypeSubtitle,
  formatTrainingMode,
  getBowlLabel,
} from './surepet/formatSurePetFeederSettings';
import './SureFeederView.css';

interface SureFeederViewProps {
  state?: SureFeederState;
}

function formatFillPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value)}%`;
}

export const SureFeederView: React.FC<SureFeederViewProps> = ({ state }) => {
  const { t } = useTranslation();
  const { formatDateTime, dateFnsLocale } = useFormatters();

  if (!state || state.bowl_status.length === 0) {
    return (
      <div className="sure-feeder-view">
        <p className="sure-feeder-view-empty">{t('devices.feeder.no_state')}</p>
      </div>
    );
  }

  const refreshedAt = coerceEpochDate(state.last_refreshed_at);
  const refreshedRelative =
    refreshedAt != null
      ? formatRelativeTimeAgo(refreshedAt, { locale: dateFnsLocale })
      : null;
  const refreshedAbsolute =
    refreshedAt != null ? formatDateTime(refreshedAt) : undefined;

  const perBowlFill = state.fill_percentages?.per_bowl ?? {};
  const hasSettings =
    state.lid_close_delay != null || state.training_mode != null;

  return (
    <div className="sure-feeder-view">
      <section
        className="sure-feeder-view-section"
        aria-label={t('devices.feeder.section_status')}
      >
        <div className="sure-feeder-view-panel">
          <SectionHeader>{t('devices.feeder.section_status')}</SectionHeader>
          <SureFeederStatus state={state} />
        </div>
      </section>

      {state.bowl_status.length > 0 ? (
        <section
          className="sure-feeder-view-section"
          aria-label={t('devices.feeder.section_bowls')}
        >
          <div className="sure-feeder-view-panel">
            <SectionHeader>{t('devices.feeder.section_bowls')}</SectionHeader>
            <ResponsiveTileGrid>
              {state.bowl_status.map((bowl, index) => {
                const bowlKey = String(index);
                const fillPercent = perBowlFill[bowlKey];
                const foodSubtitle = formatFoodTypeSubtitle(bowl.food_type, t);

                return (
                  <DashboardTile key={bowlKey}>
                    <EntitySensor
                      label={getBowlLabel(bowl, index, state.bowl_type, t)}
                      value={
                        bowl.current_weight != null
                          ? bowl.current_weight
                          : t('devices.feeder.no_reading')
                      }
                      unit={bowl.current_weight != null ? 'g' : undefined}
                      valueVariant={
                        bowl.current_weight != null ? 'metric' : 'body'
                      }
                    />
                    {foodSubtitle ? (
                      <p className="sure-feeder-view-bowl-meta">
                        {foodSubtitle}
                      </p>
                    ) : null}
                    <p className="sure-feeder-view-bowl-fill">
                      {t('devices.feeder.bowl_fill', {
                        percent: formatFillPercent(fillPercent),
                      })}
                    </p>
                  </DashboardTile>
                );
              })}
            </ResponsiveTileGrid>
          </div>
        </section>
      ) : null}

      {hasSettings ? (
        <section
          className="sure-feeder-view-section"
          aria-label={t('devices.feeder.section_settings')}
        >
          <div className="sure-feeder-view-panel">
            <SectionHeader>
              {t('devices.feeder.section_settings')}
            </SectionHeader>
            <ResponsiveTileGrid>
              {state.lid_close_delay != null ? (
                <DashboardTile>
                  <EntitySensor
                    label={t('devices.feeder.lid_close_delay')}
                    value={formatCloseDelay(state.lid_close_delay, t)}
                    valueTitle={String(state.lid_close_delay)}
                    valueVariant="body"
                  />
                </DashboardTile>
              ) : null}
              {state.training_mode != null ? (
                <DashboardTile>
                  <EntitySensor
                    label={t('devices.feeder.training_mode')}
                    value={formatTrainingMode(state.training_mode, t)}
                    valueTitle={String(state.training_mode)}
                    valueVariant="body"
                  />
                </DashboardTile>
              ) : null}
            </ResponsiveTileGrid>
          </div>
        </section>
      ) : null}

      {refreshedRelative != null ? (
        <section
          className="sure-feeder-view-section"
          aria-label={t('devices.feeder.section_diagnostics')}
        >
          <div className="sure-feeder-view-panel">
            <SectionHeader>
              {t('devices.feeder.section_diagnostics')}
            </SectionHeader>
            <ResponsiveTileGrid>
              <DashboardTile>
                <EntitySensor
                  label={t('devices.feeder.last_refreshed')}
                  value={refreshedRelative}
                  valueTitle={refreshedAbsolute}
                  valueVariant="body"
                />
              </DashboardTile>
            </ResponsiveTileGrid>
          </div>
        </section>
      ) : null}
    </div>
  );
};
