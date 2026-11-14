import * as React from 'react';
import type { IntakeKind } from 'shared';

import { Card, CardContent } from '@/components/ui/Card';
import { ReadoutGrid, type Readout } from '@/components/ui/ReadoutGrid';
import { cn } from '@/lib/utils';

import './DietaryNeedsSummary.css';

interface DietaryNeedsCard {
  kind: IntakeKind;
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
  /** Opens the band's editor. */
  onOpen: (kind: DietaryNeedsCard['kind']) => void;
}

/** A pet's bands on the Health hub: one card a band, each the button that opens its editor. */
const DietaryNeedsSummary: React.FC<DietaryNeedsSummaryProps> = ({
  cards,
  onOpen,
}) => (
  <div className="dietary-needs-summary">
    {cards.map((card) => (
      <button
        key={card.kind}
        type="button"
        className={cn('dietary-needs-card', card.kind)}
        aria-label={card.openLabel}
        onClick={() => onOpen(card.kind)}
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
      </button>
    ))}
  </div>
);

export {
  DietaryNeedsSummary,
  type DietaryNeedsSummaryProps,
  type DietaryNeedsCard,
};
