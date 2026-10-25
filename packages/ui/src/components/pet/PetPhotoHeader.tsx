import * as React from 'react';
import { Camera, Cat, ImageDown, Images, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FallbackImage } from '@/components/ui/FallbackImage';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { PickerList } from '@/components/ui/PickerList';
import type { PickerOption } from '@/components/ui/pickerOptions';
import './PetPhotoHeader.css';

interface PetPhotoHeaderLabels {
  addPhoto: string;
  changePhoto: string;
  /** Shown over the whole header while a file is dragged across it. */
  drop: string;
  sheetTitle: string;
  takePhoto: string;
  choosePhoto: string;
  removePhoto: string;
}

interface PetPhotoHeaderProps {
  src?: string;
  alt: string;
  hasPhoto: boolean;
  labels: PetPhotoHeaderLabels;
  /** MIME types the file inputs offer, e.g. `image/png,image/jpeg`. */
  accept: string;
  /** Offers "Take photo"; only worth it where `capture` opens a camera. */
  canTakePhoto?: boolean;
  onFile: (file: File) => void;
  onRemove?: () => void;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * The pet's photo, large and centred, with a camera badge. Tapping it opens
 * the photo actions; dragging a file over the header makes the whole header
 * the drop target, and a drop hands the file straight to `onFile`.
 */
const PetPhotoHeader: React.FC<PetPhotoHeaderProps> = ({
  src,
  alt,
  hasPhoto,
  labels,
  accept,
  canTakePhoto = false,
  onFile,
  onRemove,
  error,
  disabled = false,
  className,
}) => {
  const [dragging, setDragging] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const takeRef = React.useRef<HTMLInputElement>(null);
  const chooseRef = React.useRef<HTMLInputElement>(null);

  const options: PickerOption[] = [
    ...(canTakePhoto
      ? [{ value: 'take', label: labels.takePhoto, leading: <Camera /> }]
      : []),
    { value: 'choose', label: labels.choosePhoto, leading: <Images /> },
    ...(hasPhoto && onRemove
      ? [{ value: 'remove', label: labels.removePhoto, leading: <Trash2 /> }]
      : []),
  ];

  // The file inputs are clicked inside the row's click handler, so the browser
  // still sees the user's gesture and lets the picker open.
  const pick = (value: string) => {
    setSheetOpen(false);
    if (value === 'take') takeRef.current?.click();
    else if (value === 'choose') chooseRef.current?.click();
    else if (value === 'remove') onRemove?.();
  };

  const activate = () => {
    if (options.length === 1) chooseRef.current?.click();
    else setSheetOpen(true);
  };

  const takeFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared so picking the same file twice still fires a change.
    event.target.value = '';
    if (file) onFile(file);
  };

  return (
    <div
      className={cn(
        'pet-photo-header',
        dragging && 'is-dragging',
        disabled && 'is-disabled',
        className,
      )}
      onDragEnter={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (disabled) return;
        event.preventDefault();
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        if (disabled) return;
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      {dragging && (
        <div className="pet-photo-header-drop">
          <ImageDown aria-hidden="true" />
          <span>{labels.drop}</span>
        </div>
      )}
      <div className="pet-photo-header-avatar-wrap">
        <button
          type="button"
          className={cn('pet-photo-header-avatar', !hasPhoto && 'empty')}
          onClick={activate}
          disabled={disabled}
          aria-label={hasPhoto ? labels.changePhoto : labels.addPhoto}
        >
          {hasPhoto ? (
            <FallbackImage src={src} alt={alt} fallback={<Cat />} />
          ) : (
            <>
              <Cat aria-hidden="true" />
              <span>{labels.addPhoto}</span>
            </>
          )}
        </button>
        {hasPhoto && (
          <span className="pet-photo-header-badge" aria-hidden="true">
            <Camera />
          </span>
        )}
      </div>
      {error && (
        <p className="pet-photo-header-error" role="alert">
          {error}
        </p>
      )}
      <input
        ref={takeRef}
        type="file"
        accept={accept}
        capture="environment"
        hidden
        onChange={takeFile}
      />
      <input
        ref={chooseRef}
        type="file"
        accept={accept}
        hidden
        onChange={takeFile}
      />
      <PickerSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={labels.sheetTitle}
      >
        <PickerList options={options} onSelect={pick} />
      </PickerSheet>
    </div>
  );
};

export { type PetPhotoHeaderProps, type PetPhotoHeaderLabels };
export default PetPhotoHeader;
