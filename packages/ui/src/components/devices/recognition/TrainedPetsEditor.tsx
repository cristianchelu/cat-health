import * as React from 'react';
import { ChevronDown, ChevronUp, ImageOff, ImagePlus, X } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { FallbackImage } from '@/components/ui/FallbackImage';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/utils';
import './TrainedPetsEditor.css';

export interface TrainedPetThumb {
  id: number;
  url: string;
  alt: string;
}

export interface TrainedPetRow {
  id: number;
  name: string;
  avatarUrl?: string;
  isWatched: boolean;
  watchAriaLabel: string;
  statusLabel: string;
  thumbs: TrainedPetThumb[];
  referenceImageIds: number[];
  expandLabel: string;
  addImagesLabel: string;
  removeImageLabel: string;
}

interface TrainedPetsEditorProps {
  pets: TrainedPetRow[];
  emptyLabel: string;
  expandedPetId: number | null;
  onToggleExpand: (petId: number) => void;
  onToggleWatched: (petId: number, watched: boolean) => void;
  onAddImages: (petId: number) => void;
  onRemoveImage: (petId: number, mediaId: number) => void;
  disabled?: boolean;
}

/**
 * One row per pet: avatar, name, watch switch (the `ignored_pets` denylist,
 * inverted), and a status line. Expanding a row reveals its reference
 * thumbnails so add/remove stays out of the way for the common case of just
 * flipping who this camera watches.
 */
const TrainedPetsEditor: React.FC<TrainedPetsEditorProps> = ({
  pets,
  emptyLabel,
  expandedPetId,
  onToggleExpand,
  onToggleWatched,
  onAddImages,
  onRemoveImage,
  disabled,
}) => {
  const idBase = React.useId();

  if (pets.length === 0) {
    return (
      <ul className="trained-pets-editor">
        <li className="trained-pets-empty">{emptyLabel}</li>
      </ul>
    );
  }

  return (
    <ul className="trained-pets-editor">
      {pets.map((pet) => {
        const isExpanded = expandedPetId === pet.id;
        const detailId = `${idBase}-pet-${pet.id}-detail`;
        return (
          <li
            key={pet.id}
            className={cn('trained-pet-row', !pet.isWatched && 'is-ignored')}
          >
            <div className="trained-pet-row-header">
              <Avatar
                src={pet.avatarUrl}
                alt={pet.name}
                size="sm"
                className="trained-pet-row-avatar"
              />
              <div className="trained-pet-row-info">
                <span className="trained-pet-row-name">{pet.name}</span>
                <span className="trained-pet-row-status">
                  {pet.statusLabel}
                </span>
              </div>
              <Switch
                checked={pet.isWatched}
                onCheckedChange={(checked) => onToggleWatched(pet.id, checked)}
                aria-label={pet.watchAriaLabel}
                title={pet.watchAriaLabel}
                disabled={disabled}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon
                onClick={() => onToggleExpand(pet.id)}
                aria-expanded={isExpanded}
                aria-controls={isExpanded ? detailId : undefined}
                aria-label={pet.expandLabel}
              >
                {isExpanded ? (
                  <ChevronUp size={18} aria-hidden="true" />
                ) : (
                  <ChevronDown size={18} aria-hidden="true" />
                )}
              </Button>
            </div>

            {isExpanded && (
              <div className="trained-pet-row-detail" id={detailId}>
                <div className="trained-pet-thumbs">
                  {pet.thumbs.map((thumb) => (
                    <div key={thumb.id} className="trained-pet-thumb">
                      <FallbackImage
                        src={thumb.url}
                        alt={thumb.alt}
                        fallback={<ImageOff size={16} aria-hidden="true" />}
                      />
                      <button
                        type="button"
                        className="trained-pet-thumb-remove"
                        onClick={() => onRemoveImage(pet.id, thumb.id)}
                        title={pet.removeImageLabel}
                        disabled={disabled}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="trained-pet-thumb-add"
                    onClick={() => onAddImages(pet.id)}
                    title={pet.addImagesLabel}
                    disabled={disabled}
                  >
                    <ImagePlus size={20} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export { TrainedPetsEditor, type TrainedPetsEditorProps };
