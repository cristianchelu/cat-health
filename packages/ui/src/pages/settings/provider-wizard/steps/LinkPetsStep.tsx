import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import type { ProviderPetLink } from 'shared';
import { Button } from '@/components/ui/Button';
import ProviderPetLinksEditor from '../../components/ProviderPetLinksEditor';

interface LinkPetsStepProps {
  accountId: number;
  initialLinks: ProviderPetLink[];
  isSaving: boolean;
  serverError?: string | null;
  onFinish: (links: ProviderPetLink[]) => void;
  onBack: () => void;
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
  onBack,
}) => {
  const { t } = useTranslation();
  const [links, setLinks] = React.useState<ProviderPetLink[]>(initialLinks);

  return (
    <>
      <ProviderPetLinksEditor
        accountId={accountId}
        initialLinks={initialLinks}
        onChange={setLinks}
      />

      <p className="provider-note info">
        <Info size={18} aria-hidden="true" />
        <span>{t('settings.pet_links_editable_later')}</span>
      </p>

      {serverError && (
        <p className="discover-import-error" role="alert">
          {serverError}
        </p>
      )}

      <div className="form-actions">
        <Button type="button" variant="secondary" onClick={onBack}>
          {t('settings.back')}
        </Button>
        <Button type="button" onClick={() => onFinish(links)} disabled={isSaving}>
          {isSaving ? t('settings.saving') : t('settings.finish')}
        </Button>
      </div>
    </>
  );
};
