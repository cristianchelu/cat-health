import * as React from 'react';
import { cn } from '@/lib/utils';
import { getProviderBrand } from '../../provider-wizard/flows/providerBrandRegistry.ts';
import './ProviderBrandTile.css';

interface ProviderBrandTileProps {
  provider: string;
  /** sm: list rows and picker · md: listing · lg: form brand header. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Coloured square carrying a provider's mark or monogram. */
export const ProviderBrandTile: React.FC<ProviderBrandTileProps> = ({
  provider,
  size = 'md',
  className,
}) => {
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
      aria-hidden="true"
    >
      {Icon ? <Icon className="provider-brand-tile-icon" /> : brand.monogram}
    </div>
  );
};
