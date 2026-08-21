import * as React from 'react';
import { Callout } from '@/components/ui/Callout';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import type { ProviderPetLink } from 'shared';
import { FormActions } from '@/components/ui/form';
import ProviderPetLinksEditor from '../../components/ProviderPetLinksEditor';

interface LinkPetsStepProps {
  accountId: number;
  initialLinks: ProviderPetLink[];
  isSaving: boolean;
  serverError?: string | null;
  onFinish: (links: ProviderPetLink[]) => void;
  /** Abandons the wizard. Step-back is the header control. */
  onCancel: () => void;
  /** Linking is optional — it can be done later from the provider's settings. */
  onSkip?: () => void;
  /** Lets the shell guard leaving once the user has edited a row. */
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Final connect step for providers that identify pets themselves: map each
 * cloud pet onto a local profile so their events land on the right cat.
 */
export const LinkPetsStep: React.FC<LinkPetsStepProps> = ({
  accountId,
  initialLinks,
  isSaving,
  serverError,
  onFinish,
  onCancel,
  onSkip,
  onDirtyChange,
}) => {
  const { t } = useTranslation();
  /*
   * Seeded from `initialLinks`, then rebased onto the editor's auto-matched
   * baseline as soon as the cloud pet list resolves. Finishing must persist what
   * is actually on screen — the name matches the editor pre-selected — not the
   * empty list we started with.
   */
  const [links, setLinks] = React.useState<ProviderPetLink[]>(initialLinks);
  const [baseline, setBaseline] =
    React.useState<ProviderPetLink[]>(initialLinks);

  const rebase = React.useCallback((resolved: ProviderPetLink[]) => {
    setBaseline(resolved);
    setLinks(resolved);
  }, []);

  const isDirty = JSON.stringify(links) !== JSON.stringify(baseline);
  React.useEffect(() => {
    onDirtyChange?.(isDirty);
    // Matches every sibling step: without the cleanup, unmounting while dirty
    // leaves the wizard's `stepDirty` stuck on and guarding a step that is gone.
    return () => onDirtyChange?.(false);
  }, [isDirty, onDirtyChange]);

  return (
    <>
      <ProviderPetLinksEditor
        accountId={accountId}
        initialLinks={initialLinks}
        onChange={setLinks}
        onBaselineResolved={rebase}
      />

      <p className="provider-note info">
        <Info size={18} aria-hidden="true" />
        <span>{t('settings.pet_links_editable_later')}</span>
      </p>

      {serverError && <Callout message={serverError} />}

      {/*
       * Skipping is this step's dismiss: the account exists either way, and the
       * links can be made later from its settings — so it takes the cancel slot
       * rather than becoming a third button beside the commit.
       */}
      <FormActions
        onCancel={onSkip ?? onCancel}
        cancelLabel={onSkip ? t('settings.skip_for_now') : t('settings.cancel')}
        submitLabel={isSaving ? t('settings.saving') : t('settings.finish')}
        isSubmitting={isSaving}
        submitType="button"
        onSubmitClick={() => onFinish(links)}
      />
    </>
  );
};
