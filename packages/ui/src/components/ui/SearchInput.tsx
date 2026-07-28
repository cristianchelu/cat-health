import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import './SearchInput.css';

interface SearchInputProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'className'
> {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name. Listing toolbars have no room for a visible label. */
  label: string;
  /** Accessible name for the clear button. Defaults to `common.clear`. */
  clearLabel?: string;
  /** Applied to the wrapper; every other prop lands on the input. */
  className?: string;
}

/**
 * Search field for listing toolbars: leading icon, and a clear button that
 * appears once there is something to clear.
 *
 * Controlled by contract — the caller owns the query, because it also owns the
 * filtering. Escape clears the field, which is what a search box is expected to
 * do, but only swallows the key when it actually cleared something: inside a
 * modal, an empty box must let Escape through or the dialog becomes a trap.
 */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    { value, onValueChange, label, clearLabel, className, ...props },
    forwardedRef,
  ) => {
    const { t } = useTranslation();

    /*
     * Clearing has to put focus back, so the component needs the node itself —
     * but callers get the same ref they would from a bare <input>.
     */
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const setInputRef = (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    };

    const clear = () => {
      onValueChange('');
      inputRef.current?.focus();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape' && value) {
        event.stopPropagation();
        clear();
      }
      props.onKeyDown?.(event);
    };

    return (
      <div className={cn('search-input', className)}>
        <Search className="search-input-icon" size={18} aria-hidden />
        <input
          {...props}
          ref={setInputRef}
          type="search"
          className="search-input-field"
          aria-label={label}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {value && (
          <button
            type="button"
            className="search-input-clear"
            aria-label={clearLabel ?? t('common.clear')}
            onClick={clear}
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
    );
  },
);

SearchInput.displayName = 'SearchInput';

export { SearchInput, type SearchInputProps };
