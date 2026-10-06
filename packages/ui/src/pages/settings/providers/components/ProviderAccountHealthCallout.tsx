import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderAccountHealthDTO } from 'shared';
import { useReloadProviderAccount } from '@/hooks/queries/deviceQueries';
import { useFormatters } from '@/hooks/context/useRegionalPreferences';
import { accountHealthPresentation } from '@/lib/accountHealth';
import { formatRelativeTimeAgo } from '@/lib/formatRelativeTime';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

interface ProviderAccountHealthCalloutProps {
  accountId: number;
  health: ProviderAccountHealthDTO | null;
}

/** What is wrong with a running account, with the retry that skips its backoff. */
const ProviderAccountHealthCallout: React.FC<
  ProviderAccountHealthCalloutProps
> = ({ accountId, health }) => {
  const { t } = useTranslation();
  const { dateFnsLocale } = useFormatters();
  const reload = useReloadProviderAccount(accountId);

  const presentation = accountHealthPresentation(health?.state);
  if (!health || !presentation) return null;

  const when = health.next_retry_at
    ? formatRelativeTimeAgo(health.next_retry_at, { locale: dateFnsLocale })
    : null;

  return (
    <Callout
      tone={presentation.tone}
      message={t(presentation.calloutKey, {
        reason: health.reason ?? '',
        when: when ?? '',
      })}
      actions={
        health.state === 'starting' ? null : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => reload.mutate()}
            disabled={reload.isPending}
          >
            {t('settings.account_health.retry_now')}
          </Button>
        )
      }
    />
  );
};

export { type ProviderAccountHealthCalloutProps };
export default ProviderAccountHealthCallout;
