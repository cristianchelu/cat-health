import * as React from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Toilet, Droplets } from 'lucide-react';
import PoopIcon from '@/components/icons/PoopIcon';
import { LitterboxTrendGrid } from '@/components/litterbox';
import type { LitterboxTrendsResponseDTO } from 'shared';

import './LitterboxVisitsCard.css';

export type LitterboxVisitsCardState =
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'data';
      timeSincePee: string | null;
      timeSincePoop: string | null;
      days: LitterboxTrendsResponseDTO['days'];
    };

export interface LitterboxVisitsCardViewProps {
  state: LitterboxVisitsCardState;
  /** Text rendered in the chart slot when the trends failed to load. */
  errorLabel: string;
  /** Accessible label for the interactive card. */
  ariaLabel: string;
  /** Invoked on click / keyboard activation to open the details view. */
  onOpen: () => void;
}

const MAX_DOTS_PER_DAY = 4;
const PLACEHOLDER = '--';

const LitterboxVisitsCardView: React.FC<LitterboxVisitsCardViewProps> = ({
  state,
  errorLabel,
  ariaLabel,
  onOpen,
}) => {
  const isLoading = state.status === 'loading';
  // The card is disabled only while loading; the error card still navigates.
  const clickable = !isLoading;

  const handleClick = () => {
    if (clickable) onOpen();
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (!clickable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen();
    }
  };

  const peeLabel =
    state.status === 'data' ? (state.timeSincePee ?? PLACEHOLDER) : PLACEHOLDER;
  const poopLabel =
    state.status === 'data'
      ? (state.timeSincePoop ?? PLACEHOLDER)
      : PLACEHOLDER;

  const statsHeader = (
    <div className="litterbox-stats">
      <span className="litterbox-stat">
        <Droplets size={18} color="#FFA500" />
        {peeLabel}
      </span>
      <span className="litterbox-stat">
        <PoopIcon size={18} color="#8B4513" />
        {poopLabel}
      </span>
    </div>
  );

  let body: React.ReactNode;
  if (state.status === 'error') {
    body = (
      <CardContent empty className="overview-litterbox-chart-slot">
        <p>{errorLabel}</p>
      </CardContent>
    );
  } else if (isLoading) {
    body = (
      <CardContent className="overview-litterbox-chart-slot">
        <div
          className="litterbox-dot-chart litterbox-dot-chart--pending"
          aria-hidden
        />
      </CardContent>
    );
  } else {
    body = (
      <CardContent className="overview-litterbox-chart-slot">
        <LitterboxTrendGrid
          className="litterbox-dot-chart"
          days={state.days}
          maxDots={MAX_DOTS_PER_DAY}
        />
      </CardContent>
    );
  }

  return (
    <Card
      className="litterbox-visits-card litterbox-visits-card--interactive"
      isLoading={isLoading}
      role="button"
      tabIndex={clickable ? 0 : -1}
      aria-label={ariaLabel}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <CardHeader>
        <Toilet style={{ marginRight: 'auto' }} />
        {statsHeader}
      </CardHeader>
      {body}
    </Card>
  );
};

export default LitterboxVisitsCardView;
