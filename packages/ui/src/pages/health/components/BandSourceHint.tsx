import * as React from 'react';

import { TileNote } from '@/components/ui/TileNote';

import './BandSourceHint.css';

interface BandSourceHintProps {
  /** Names the glyph and the tip it opens. */
  label: string;
  /** What to say about where the band's numbers come from, a sentence each. */
  sentences: readonly string[];
  /** The source document, opened in a new tab. */
  href: string;
  linkLabel: string;
}

/** The mark beside a band that says which source its numbers come from, with a way to read it. */
const BandSourceHint: React.FC<BandSourceHintProps> = ({
  label,
  sentences,
  href,
  linkLabel,
}) => (
  <TileNote
    tone="help"
    className="band-source-hint"
    label={label}
    body={sentences.join(' ')}
    action={
      <a href={href} target="_blank" rel="noreferrer">
        {linkLabel}
      </a>
    }
  />
);

export { BandSourceHint, type BandSourceHintProps };
