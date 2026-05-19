import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Toilet, Droplets } from 'lucide-react';
import PoopIcon from '@/components/icons/PoopIcon';
import { usePetLitterboxTrends } from '@/hooks/queries/petQueries';
import { useDateWindowNavigation } from '@/hooks/useDateWindowNavigation';
import { LitterboxTrendGrid } from '@/components/litterbox';
import {
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from 'date-fns';
import './LitterboxVisitsCard.css';

interface LitterboxVisitsCardProps {
  petId: number;
}

const MAX_DOTS_PER_DAY = 4;

function formatShortDuration(date: Date): string {
  const now = new Date();
  const days = differenceInDays(now, date);
  if (days >= 1) return `${days}d`;

  const hours = differenceInHours(now, date);
  if (hours >= 1) return `${hours}h`;

  const minutes = differenceInMinutes(now, date);
  return `${minutes}m`;
}

const LitterboxVisitsCard: React.FC<LitterboxVisitsCardProps> = ({ petId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { startTime, endTime } = useDateWindowNavigation({ days: 7 });

  const { data, isLoading, error } = usePetLitterboxTrends(petId, {
    startTime,
    endTime,
  });

  const timeSinceLastPee = data?.lastPee
    ? formatShortDuration(new Date(data.lastPee))
    : null;

  const timeSinceLastPoop = data?.lastPoop
    ? formatShortDuration(new Date(data.lastPoop))
    : null;

  if (error && !isLoading) {
    return (
      <Card
        className="litterbox-visits-card litterbox-visits-card--interactive"
        role="button"
        tabIndex={0}
        onClick={() => navigate('/overview/litterbox')}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            navigate('/overview/litterbox');
          }
        }}
      >
        <CardHeader>
          <Toilet style={{ marginRight: 'auto' }} />
          <div className="litterbox-stats">
            <span className="litterbox-stat">
              <Droplets size={18} color="#FFA500" />
              --
            </span>
            <span className="litterbox-stat">
              <PoopIcon size={18} color="#8B4513" />
              --
            </span>
          </div>
        </CardHeader>
        <CardContent empty className="overview-litterbox-chart-slot">
          <p>{t('overview.error_loading')}</p>
        </CardContent>
      </Card>
    );
  }

  const statsHeader = isLoading ? (
    <div className="litterbox-stats">
      <span className="litterbox-stat">
        <Droplets size={18} color="#FFA500" />
        --
      </span>
      <span className="litterbox-stat">
        <PoopIcon size={18} color="#8B4513" />
        --
      </span>
    </div>
  ) : (
    <div className="litterbox-stats">
      <span className="litterbox-stat">
        <Droplets size={18} color="#FFA500" />
        {timeSinceLastPee ?? '--'}
      </span>
      <span className="litterbox-stat">
        <PoopIcon size={18} color="#8B4513" />
        {timeSinceLastPoop ?? '--'}
      </span>
    </div>
  );

  const chartBody = isLoading ? (
    <div className="litterbox-dot-chart litterbox-dot-chart--pending" aria-hidden />
  ) : (
    <LitterboxTrendGrid
      className="litterbox-dot-chart"
      days={data?.days ?? []}
      maxDots={MAX_DOTS_PER_DAY}
    />
  );

  const handleNavigate = () => {
    if (!isLoading) navigate('/overview/litterbox');
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (isLoading) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate('/overview/litterbox');
    }
  };

  return (
    <Card
      className="litterbox-visits-card litterbox-visits-card--interactive"
      isLoading={isLoading}
      role="button"
      tabIndex={isLoading ? -1 : 0}
      aria-label={t('litterbox_details.open_details')}
      onClick={handleNavigate}
      onKeyDown={handleKeyDown}
    >
      <CardHeader>
        <Toilet style={{ marginRight: 'auto' }} />
        {statsHeader}
      </CardHeader>
      <CardContent className="overview-litterbox-chart-slot">
        {chartBody}
      </CardContent>
    </Card>
  );
};

export default LitterboxVisitsCard;
