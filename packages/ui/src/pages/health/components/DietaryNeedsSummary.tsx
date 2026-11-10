import * as React from 'react';
import { Link, type To } from 'react-router';

import { Card, CardContent } from '@/components/ui/Card';
import { ReadoutGrid, type Readout } from '@/components/ui/ReadoutGrid';
import { cn } from '@/lib/utils';

import './DietaryNeedsSummary.css';

interface DietaryNeedsCard {
  kind: 'food' | 'water';
  icon: React.ReactNode;
  title: string;
  /** The band as text ("178–256"), or the words for having none. */
  range: string;
  /** What the range is in ("kcal a day"); null when there is no band. */
  unit: string | null;
  readouts: readonly Readout[];
  /** Accessible name of the card, which opens the band for editing. */
  openLabel: string;
}

interface DietaryNeedsSummaryProps {
  cards: readonly DietaryNeedsCard[];
  /** Where a card leads, with the state that names the way back. */
  to: To;
  state?: unknown;
}

/** A pet's bands on the Health hub: one card a band, each a link to the Dietary needs page. */
const DietaryNeedsSummary: React.FC<DietaryNeedsSummaryProps> = ({
  cards,
  to,
  state,
}) => (
  <div className="dietary-needs-summary">
    {cards.map((card) => (
      <Link
        key={card.kind}
        to={to}
        state={state}
        className={cn('dietary-needs-card', card.kind)}
        aria-label={card.openLabel}
      >
        <Card>
          <CardContent>
            <div className="dietary-needs-card-body">
              <div className="dietary-needs-card-head">
                <span className="dietary-needs-card-icon">{card.icon}</span>
                {card.title}
              </div>
              <div className="dietary-needs-card-range">
                <span className="dietary-needs-card-numbers">{card.range}</span>
                {card.unit !== null && (
                  <span className="dietary-needs-card-unit">{card.unit}</span>
                )}
              </div>
              <ReadoutGrid columns={2} readouts={card.readouts} />
            </div>
          </CardContent>
        </Card>
      </Link>
    ))}
  </div>
);

export {
  DietaryNeedsSummary,
  type DietaryNeedsSummaryProps,
  type DietaryNeedsCard,
};
