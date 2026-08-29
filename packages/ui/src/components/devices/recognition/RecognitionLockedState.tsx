import * as React from 'react';
import { ScanSearch, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { RecognitionStateCard } from './RecognitionStateCard';
import './RecognitionLockedState.css';

interface RecognitionLockedStateProps {
  title: string;
  ctaLabel: string;
  onGoToCamera: () => void;
  showProviderHint?: boolean;
  providerHint?: string;
  providerCtaLabel?: string;
  onGoToProvider?: () => void;
}

/**
 * Rendered when the device has no camera link: recognition has nothing to
 * watch yet. The provider hint is a secondary, quieter row shown only when
 * there is also no inference account configured.
 */
const RecognitionLockedState: React.FC<RecognitionLockedStateProps> = ({
  title,
  ctaLabel,
  onGoToCamera,
  showProviderHint,
  providerHint,
  providerCtaLabel,
  onGoToProvider,
}) => {
  return (
    <div className="recognition-locked-state">
      <RecognitionStateCard icon={<ScanSearch size={20} />} title={title}>
        <Button onClick={onGoToCamera}>{ctaLabel}</Button>
      </RecognitionStateCard>
      {showProviderHint && (
        <Callout
          tone="info"
          icon={<Sparkles size={18} />}
          actions={
            onGoToProvider && (
              <Button variant="ghost" size="sm" onClick={onGoToProvider}>
                {providerCtaLabel}
              </Button>
            )
          }
        >
          {providerHint}
        </Callout>
      )}
    </div>
  );
};

export { RecognitionLockedState, type RecognitionLockedStateProps };
