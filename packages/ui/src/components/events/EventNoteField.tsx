import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, StickyNote } from 'lucide-react';
import { EVENT_NOTE_MAX_LENGTH } from 'shared';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/form';
import { useFormatters } from '@/contexts/RegionalPreferencesProvider';
import './EventNoteField.css';

interface EventNoteFieldProps {
  note: string | null;
  noteUpdatedAt: string | null;
  onSave: (note: string) => Promise<unknown>;
  disabled?: boolean;
  /**
   * Raised while the textarea holds unsaved text, so the surface around it can
   * ask before an escape or a scrim tap throws the note away.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * The one free-text field on an otherwise read-only surface.
 *
 * It carries its own Cancel/Save rather than joining a screen commit row: the
 * rest of the surface commits nothing, so there is no row for it to join, and
 * the same local-commit grammar is what the edit form uses. Re-editing
 * overwrites — one note per event, no thread.
 */
const EventNoteField: React.FC<EventNoteFieldProps> = ({
  note,
  noteUpdatedAt,
  onSave,
  disabled = false,
  onDirtyChange,
}) => {
  const { t } = useTranslation();
  const { formatDateTime } = useFormatters();
  const [isEditing, setIsEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  const isDirty = isEditing && draft.trim() !== (note ?? '');
  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  const startEdit = () => {
    setDraft(note ?? '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(draft.trim());
      setIsEditing(false);
    } catch {
      // Stay in the textarea with the text intact: a note that vanished on a
      // failed write would be the one thing on this surface you cannot recover.
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="event-note-field is-editing">
        <Textarea
          ref={textareaRef}
          className="event-note-field-input"
          value={draft}
          maxLength={EVENT_NOTE_MAX_LENGTH}
          rows={3}
          disabled={isSaving}
          aria-label={t('event_details.note_label')}
          placeholder={t('event_details.add_note')}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="event-note-field-actions">
          <Button
            type="button"
            variant="neutral"
            size="sm"
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            {t('event_details.save_note')}
          </Button>
        </div>
      </div>
    );
  }

  if (note == null || note === '') {
    return (
      <button
        type="button"
        className="event-note-field is-empty"
        onClick={startEdit}
        disabled={disabled}
      >
        <StickyNote aria-hidden />
        <span>{t('event_details.add_note')}</span>
      </button>
    );
  }

  return (
    <div className="event-note-field is-filled">
      <StickyNote aria-hidden />
      <span className="event-note-field-body">
        {note}
        {noteUpdatedAt && (
          <span className="event-note-field-meta">
            {t('event_details.note_author_you')} ·{' '}
            {formatDateTime(new Date(noteUpdatedAt))}
          </span>
        )}
      </span>
      <Button
        type="button"
        variant="ghost"
        icon
        onClick={startEdit}
        disabled={disabled}
        title={t('event_details.edit_note')}
        aria-label={t('event_details.edit_note')}
      >
        <Pencil size={15} aria-hidden />
      </Button>
    </div>
  );
};

export default EventNoteField;
