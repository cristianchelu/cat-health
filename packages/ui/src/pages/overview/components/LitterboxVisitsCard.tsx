import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from 'date-fns';
import { usePetLitterboxTrends } from '@/hooks/queries/petQueries';
import { useDateWindowNavigation } from '@/hooks/useDateWindowNavigation';
import LitterboxVisitsCardView, {
  type LitterboxVisitsCardState,
} from './LitterboxVisitsCardView';

interface LitterboxVisitsCardProps {
  petId: number;
  isPending?: boolean;
}

function formatShortDuration(date: Date): string {
  const now = new Date();
  const days = differenceInDays(now, date);
  if (days >= 1) return `${days}d`;

  const hours = differenceInHours(now, date);
  if (hours >= 1) return `${hours}h`;

  const minutes = differenceInMinutes(now, date);
  return `${minutes}m`;
}

const LitterboxVisitsCard: React.FC<LitterboxVisitsCardProps> = ({
  petId,
  isPending = false,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { startTime, endTime } = useDateWindowNavigation({ days: 7 });

  const {
    data,
    isLoading: isQueryLoading,
    error,
  } = usePetLitterboxTrends(petId, { startTime, endTime }, petId > 0);
  const isLoading = isQueryLoading || isPending;

  let state: LitterboxVisitsCardState;
  if (isLoading) {
    state = { status: 'loading' };
  } else if (error) {
    state = { status: 'error' };
  } else {
    state = {
      status: 'data',
      timeSincePee: data?.lastPee
        ? formatShortDuration(new Date(data.lastPee))
        : null,
      timeSincePoop: data?.lastPoop
        ? formatShortDuration(new Date(data.lastPoop))
        : null,
      days: data?.days ?? [],
    };
  }

  return (
    <LitterboxVisitsCardView
      state={state}
      errorLabel={t('overview.error_loading')}
      ariaLabel={t('litterbox_details.open_details')}
      onOpen={() => navigate('/overview/litterbox')}
    />
  );
};

export default LitterboxVisitsCard;
