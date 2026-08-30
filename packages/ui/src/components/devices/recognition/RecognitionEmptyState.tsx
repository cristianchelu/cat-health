import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { RecognitionStateCard } from './RecognitionStateCard';

interface RecognitionEmptyStateProps {
  title: string;
  ctaLabel: string;
  onConnectProvider: () => void;
}

/**
 * Rendered when a camera is linked but no account can pay for a vision call —
 * either none is connected or the only one is switched off. Connecting an
 * account happens in Providers; recognition itself is configured here once one
 * exists.
 */
const RecognitionEmptyState: React.FC<RecognitionEmptyStateProps> = ({
  title,
  ctaLabel,
  onConnectProvider,
}) => {
  return (
    <RecognitionStateCard icon={<Sparkles size={20} />} title={title}>
      <Button onClick={onConnectProvider}>{ctaLabel}</Button>
    </RecognitionStateCard>
  );
};

export { RecognitionEmptyState, type RecognitionEmptyStateProps };
