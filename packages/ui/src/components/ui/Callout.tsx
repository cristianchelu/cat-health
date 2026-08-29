import * as React from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import './Callout.css';

type CalloutTone = 'error' | 'warning' | 'success' | 'info';

interface CalloutProps extends React.ComponentProps<'div'> {
  tone?: CalloutTone;
  /** Convenience for the common case of a single string. */
  message?: string | null;
  /**
   * Replaces the tone's own glyph where a surface has a better one — the
   * sparkle on a machine's guess, say. The tone still picks the tint.
   */
  icon?: React.ReactNode;
  /** Buttons that answer the callout, on the trailing edge. */
  actions?: React.ReactNode;
}

/**
 * A tinted band saying something worth knowing, or something that went wrong.
 *
 * The one infobox. Four severities, an icon that names the severity without
 * relying on the tint alone, and an optional trailing slot for the buttons
 * that answer it — enough to be the settings note, the form error and the
 * event-details correction band, which were three separate components saying
 * the same thing three ways.
 *
 * Renders nothing without content, so a caller can hand it a nullable error
 * and stop writing the guard.
 *
 * Only `error` announces itself. A warning, a confirmation or a note that
 * interrupts a screen reader mid-task costs more than it tells.
 */
const TONE_GLYPHS: Record<CalloutTone, React.ReactNode> = {
  error: <CircleAlert size={18} />,
  warning: <TriangleAlert size={18} />,
  success: <CircleCheck size={18} />,
  info: <Info size={18} />,
};

const Callout = React.forwardRef<HTMLDivElement, CalloutProps>(
  (
    { tone = 'error', message, icon, actions, className, children, ...props },
    ref,
  ) => {
    const content = message ?? children;
    if (!content) return null;

    return (
      <div
        className={cn('callout', tone, className)}
        ref={ref}
        role={tone === 'error' ? 'alert' : undefined}
        {...props}
      >
        {/* Icon and sentence are one block so the glyph can sit on the first
            line of a paragraph while the buttons stay centred on the row.
            Hidden here rather than on each glyph: the sentence beside it
            already says what the icon says. */}
        <span className="callout-main">
          <span className="callout-icon" aria-hidden="true">
            {icon ?? TONE_GLYPHS[tone]}
          </span>
          <span className="callout-body">{content}</span>
        </span>
        {actions ? <span className="callout-actions">{actions}</span> : null}
      </div>
    );
  },
);

Callout.displayName = 'Callout';

export { Callout, type CalloutProps, type CalloutTone };
