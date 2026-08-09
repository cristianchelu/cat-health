import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RecognitionStateCard } from './RecognitionStateCard';

interface RecognitionEmptyStateProps {
  title: string;
  ctaLabel: string;
  onAddDevice: () => void;
}

/**
 * Rendered when a camera is linked but no pet recognizer exists in the
 * account yet. Registration always happens through the inference device
 * wizard — this tab never auto-creates one.
 */
const RecognitionEmptyState: React.FC<RecognitionEmptyStateProps> = ({
  title,
  ctaLabel,
  onAddDevice,
}) => {
  return (
    <RecognitionStateCard icon={<Sparkles size={20} />} title={title}>
      <Button onClick={onAddDevice}>{ctaLabel}</Button>
    </RecognitionStateCard>
  );
};

export { RecognitionEmptyState, type RecognitionEmptyStateProps };
