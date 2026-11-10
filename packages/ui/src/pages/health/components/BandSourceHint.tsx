import * as React from 'react';
import { ExternalLink } from 'lucide-react';

import { TileNote } from '@/components/ui/TileNote';

import './BandSourceHint.css';

interface BandSourceHintProps {
  /** Names the glyph and the tip it opens. */
  label: string;
  /** What to say about where the band's numbers come from, a sentence each. */
  sentences: readonly string[];
  /** The source document, opened in a new tab. */
  href: string;
  /** Accessible name of the link, which is drawn as an icon. */
  linkLabel: string;
}

/**
 * The mark beside a band that says which source its numbers come from. The
 * way to the document is an icon at the end of the sentence, so the tip stays
 * one short paragraph.
 */
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
    body={
      <>
        {sentences.join(' ')}{' '}
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={linkLabel}
          title={linkLabel}
        >
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </>
    }
  />
);

export { BandSourceHint, type BandSourceHintProps };
