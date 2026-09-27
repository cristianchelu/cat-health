import * as React from 'react';
import { DashboardTile } from '@/components/layout/DashboardTile';
import { ResponsiveTileGrid } from '@/components/layout/ResponsiveTileGrid';
import Avatar from '@/components/ui/Avatar';
import { FormTile } from '@/components/ui/form';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/utils';
import { TileNote, type TileNoteProps } from '@/components/ui/TileNote';
import './PetToggleGrid.css';

/** What a tile's help glyph opens: a sentence, and maybe a way to act on it. */
export type PetToggleHelp = Omit<TileNoteProps, 'tone' | 'className'>;

export interface PetToggleTile {
  id: string;
  name: string;
  /** A second line under the name, such as the provider's own name for it. */
  subtitle?: string;
  avatarUrl?: string;
  /** Drawn in the avatar's place when there is no photo. */
  icon?: React.ReactNode;
  on: boolean;
  /** Whether the switch can be flipped. */
  eligible: boolean;
  switchAriaLabel: string;
  /** What the help glyph before the switch opens, when there is one. */
  help?: PetToggleHelp;
}

interface PetToggleGridProps {
  pets: PetToggleTile[];
  emptyLabel: string;
  onToggle: (id: string, on: boolean) => void;
  disabled?: boolean;
}

/**
 * One tile per identity: avatar and name on the left, a switch on the right,
 * with a help glyph before the switch wherever there is something to say.
 */
const PetToggleGrid: React.FC<PetToggleGridProps> = ({
  pets,
  emptyLabel,
  onToggle,
  disabled,
}) => {
  const idBase = React.useId();

  if (pets.length === 0) {
    return <p className="pet-toggle-grid-empty">{emptyLabel}</p>;
  }

  return (
    <ResponsiveTileGrid className="pet-toggle-grid">
      {pets.map((pet) => {
        const switchId = `${idBase}-${pet.id}`;
        return (
          <DashboardTile key={pet.id}>
            <FormTile
              className={cn('pet-toggle-tile', !pet.eligible && 'is-locked')}
              htmlFor={switchId}
              label={
                <span className="pet-toggle-identity">
                  <Avatar
                    src={pet.avatarUrl}
                    alt=""
                    size="sm"
                    fallbackIcon={pet.icon}
                    className="pet-toggle-avatar"
                  />
                  <span className="pet-toggle-text">
                    <span className="pet-toggle-name">{pet.name}</span>
                    {pet.subtitle ? (
                      <span className="pet-toggle-subtitle">
                        {pet.subtitle}
                      </span>
                    ) : null}
                  </span>
                </span>
              }
            >
              {pet.help ? <TileNote tone="help" {...pet.help} /> : null}
              <Switch
                id={switchId}
                checked={pet.on}
                onCheckedChange={(checked) => onToggle(pet.id, checked)}
                aria-label={pet.switchAriaLabel}
                disabled={disabled || !pet.eligible}
              />
            </FormTile>
          </DashboardTile>
        );
      })}
    </ResponsiveTileGrid>
  );
};

export { PetToggleGrid, type PetToggleGridProps };
