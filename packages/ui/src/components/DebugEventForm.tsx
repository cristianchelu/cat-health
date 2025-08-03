import { useState } from 'react';

interface DebugEventFormProps {
  onSubmit: (eventData: unknown) => Promise<void>;
}

export default function DebugEventForm({ onSubmit }: DebugEventFormProps) {
  const [eventJson, setEventJson] = useState<string>(
    '{\n  "type": "debug",\n  "value": 0\n}'
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    let parsedData: unknown;
    try {
      parsedData = JSON.parse(eventJson);
    } catch {
      setError('Invalid JSON format');
      setIsSubmitting(false);
      return;
    }

    try {
      await onSubmit(parsedData);
      setEventJson('{\n  "type": "debug",\n  "value": 0\n}');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to add event');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="debug">
      <div className="debug-title">Debug: Add Event</div>
      <form onSubmit={handleSubmit} className="debug-form">
        <label>Event JSON</label>
        <textarea
          className="debug-textarea"
          rows={6}
          value={eventJson}
          onChange={(e) => setEventJson(e.target.value)}
          disabled={isSubmitting}
        />
        {error && <div className="debug-error">{error}</div>}
        <button
          type="submit"
          className="debug-btn"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Adding...' : 'Add Event'}
        </button>
      </form>
    </div>
  );
}