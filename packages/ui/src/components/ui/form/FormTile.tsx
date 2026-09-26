import * as React from 'react';
import { cn } from '@/lib/utils';
import './FormTile.css';

interface FormTileProps extends React.ComponentProps<'div'> {
  label: string;
  /** The control's id, so the label focuses or toggles it. */
  htmlFor?: string;
  /** A quiet line under the row, e.g. a write still in flight. */
  note?: string;
  error?: string;
}

/**
 * One field as a mini-card: label on the left, a compact control on the
 * right. For a form made of many small values, where a full-width field per
 * value would stretch a three-digit number across the page. Lay tiles out in
 * a `ResponsiveTileGrid` inside `FormShell`; the tile is the surface, so no
 * `FormCard` goes around them.
 */
const FormTile = React.forwardRef<HTMLDivElement, FormTileProps>(
  ({ label, htmlFor, note, error, className, children, ...props }, ref) => (
    <div className={cn('form-tile', className)} ref={ref} {...props}>
      <div className="form-tile-row">
        <label className="form-tile-label" htmlFor={htmlFor}>
          {label}
        </label>
        <div className="form-tile-control">{children}</div>
      </div>
      {error ? (
        <p className="form-tile-error" role="alert">
          {error}
        </p>
      ) : note ? (
        <p className="form-tile-note">{note}</p>
      ) : null}
    </div>
  ),
);

FormTile.displayName = 'FormTile';

export { FormTile, type FormTileProps };
