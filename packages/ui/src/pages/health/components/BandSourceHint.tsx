import * as React from 'react';
import { ExternalLink } from 'lucide-react';

import { TileNote } from '@/components/ui/TileNote';

import './BandSourceHint.css';

interface BandSourceHintProps {
  /** Names the glyph and the tip it opens. */
  label: string;
  /** The source's name, the tip's first line. */
  source: string;
  /** Where in the source the numbers are, the second line. */
  reference: string;
  /** What the app changed after the source answered, a line each. */
  notes: readonly string[];
  /** The source document, opened in a new tab. */
  href: string;
  /** Accessible name of the link, which is drawn as an icon. */
  linkLabel: string;
}

/**
 * The mark beside a band that says where its numbers come from: the source
 * with a way to read it, then the place in it.
 */
const BandSourceHint: React.FC<BandSourceHintProps> = ({
  label,
  source,
  reference,
  notes,
  href,
  linkLabel,
}) => (
  <TileNote
    tone="help"
    className="band-source-hint"
    label={label}
    body={
      <>
        {source}{' '}
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={linkLabel}
          title={linkLabel}
        >
          <ExternalLink size={14} aria-hidden="true" />
        </a>
        <br />
        {reference}
        {notes.map((note) => (
          <React.Fragment key={note}>
            <br />
            {note}
          </React.Fragment>
        ))}
      </>
    }
  />
);

export { BandSourceHint, type BandSourceHintProps };
