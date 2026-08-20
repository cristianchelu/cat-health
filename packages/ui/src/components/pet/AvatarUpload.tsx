import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { ImagePlus, X, UploadCloud } from 'lucide-react';
import './avatar-upload.css';

export interface AvatarUploadProps {
  value?: File | null;
  existingUrl?: string | null; // existing avatar when editing
  onChange: (file: File | null) => void;
  disabled?: boolean;
  label?: string;
  maxSizeBytes?: number;
  className?: string;
}

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

const AvatarUpload: React.FC<AvatarUploadProps> = ({
  value,
  existingUrl,
  onChange,
  disabled = false,
  label,
  maxSizeBytes = 2_000_000,
  className,
  ...props
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!ACCEPTED.includes(file.type)) {
        setError(t('common.unsupported_file_type'));
        return;
      }
      if (file.size > maxSizeBytes) {
        setError(t('common.file_too_large'));
        return;
      }
      setError(null);
      onChange(file);
    },
    [onChange, maxSizeBytes, t],
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const previewUrl = value ? URL.createObjectURL(value) : (existingUrl ?? null);

  return (
    <div className={cn('avatar-upload', className)} {...props}>
      <label className="label">{label || t('common.avatar_label')}</label>
      <div
        className={cn(
          'drop-zone',
          dragActive && 'drag',
          disabled && 'disabled',
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragActive(false);
        }}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-label={t('common.upload_avatar_label')}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={t('common.avatar_preview_alt')}
            className="preview"
          />
        ) : (
          <div className="placeholder">
            <ImagePlus size={48} />
            <p>{t('common.drop_or_click')}</p>
            <small>{t('common.file_requirements')}</small>
          </div>
        )}
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="clear-btn"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            disabled={disabled}
            aria-label={t('common.remove_avatar_label')}
          >
            <X size={16} />
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="file-input"
        onChange={onInputChange}
        disabled={disabled}
        aria-hidden
        tabIndex={-1}
      />
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {value && !error && (
        <div className="file-info">
          <UploadCloud size={14} /> <span>{value.name}</span>{' '}
          <span>{(value.size / 1024).toFixed(1)} KB</span>
        </div>
      )}
    </div>
  );
};

export default AvatarUpload;
