import * as React from 'react';
import { cn } from '@/lib/utils';
import { getProviderBrand } from '../../provider-wizard/flows/providerBrandRegistry.ts';
import './ProviderBrandTile.css';

interface ProviderBrandTileProps extends React.ComponentProps<'div'> {
  provider: string;
  /** sm: list rows and picker · md: listing · lg: form brand header. */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Coloured square carrying a provider's mark or monogram.
 *
 * Purely decorative: callers must render the provider name as real text
 * themselves. `aria-hidden` alone is not enough — Chrome still folds hidden
 * subtrees into the accessible name of a wrapping `<label>`, which turned the
 * picker's SurePet radio into "S Sure Petcare". The monogram is therefore drawn
 * with a `::before` from `data-monogram` so it is never text content at all,
 * matching the icon variants that contribute nothing either.
 */
const ProviderBrandTile = React.forwardRef<
  HTMLDivElement,
  ProviderBrandTileProps
>(({ provider, size = 'md', className, ...props }, ref) => {
  const brand = getProviderBrand(provider);
  const Icon = brand.Icon;

  return (
    <div
      className={cn('provider-brand-tile', size, className)}
      // Colours are data from the registry, not styling decisions this
      // component makes — hence inline rather than a class per provider.
      style={{
        backgroundColor: brand.tileColor,
        color: brand.tileTextColor ?? 'var(--color-white)',
      }}
      data-monogram={Icon ? undefined : brand.monogram}
      aria-hidden="true"
      ref={ref}
      {...props}
    >
      {Icon ? <Icon className="provider-brand-tile-icon" /> : null}
    </div>
  );
});

ProviderBrandTile.displayName = 'ProviderBrandTile';

export { ProviderBrandTile, type ProviderBrandTileProps };
