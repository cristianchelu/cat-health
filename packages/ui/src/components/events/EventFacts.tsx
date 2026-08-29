import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { EventFact } from './buildEventFacts';
import './EventFacts.css';

/**
 * One measured fact: a tinted glyph, the reading, and what it is.
 *
 * Absence is stated rather than hidden — a removed weight still occupies its
 * place and says "no reading", because a fact that silently disappears reads
 * as a fact that was never taken.
 */
const Fact: React.FC<{ fact: EventFact }> = ({ fact }) => {
  const { t } = useTranslation();
  return (
    <span className="event-fact">
      <span className={`event-fact-glyph tone-${fact.tone}`}>{fact.glyph}</span>
      <span className="event-fact-body">
        {fact.value === null ? (
          <b className="is-absent">{t('event_details.fact_no_reading')}</b>
        ) : (
          <b>
            {fact.value}
            {fact.unit && <small>{fact.unit}</small>}
          </b>
        )}
        <span>{fact.label}</span>
      </span>
    </span>
  );
};

/** What the sensors said about this event, in reading order. */
const EventFacts: React.FC<{ facts: EventFact[] }> = ({ facts }) =>
  facts.length === 0 ? null : (
    <div className="event-facts">
      {facts.map((fact) => (
        <Fact key={fact.key} fact={fact} />
      ))}
    </div>
  );

export default EventFacts;
