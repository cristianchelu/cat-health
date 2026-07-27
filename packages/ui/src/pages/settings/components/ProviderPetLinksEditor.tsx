import * as React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderPetLink } from 'shared';
import { FormField, Select } from '@/components/ui/form';
import { usePets } from '@/hooks/queries/petQueries';
import { useRemotePets } from '@/hooks/queries/deviceQueries';
import {
  buildPetLinksFromCloud,
  getTagIdFromLink,
  petLinksForSave,
} from '../providerPetLinkUtils';
import './ProviderPetLinksEditor.css';

interface ProviderPetLinksEditorProps {
  accountId: number;
  initialLinks: ProviderPetLink[];
  /** A row was edited. Fires only for real user input. */
  onChange: (links: ProviderPetLink[]) => void;
  /**
   * The auto-matched baseline resolved (and re-fires if it changes).
   *
   * The editor matches cloud pets onto local profiles by name and renders those
   * matches **pre-selected**, so what's on screen is not `initialLinks`. A
   * consumer that only listened to `onChange` would save an empty list whenever
   * the user accepts the matches without touching a dropdown — which is the
   * common case. Consumers must treat this, not `initialLinks`, as the value to
   * persist, and as the baseline to measure dirtiness against.
   */
  onBaselineResolved?: (links: ProviderPetLink[]) => void;
}

const UNLINKED_VALUE = '0';

const ProviderPetLinksEditor: React.FC<ProviderPetLinksEditorProps> = ({
  accountId,
  initialLinks,
  onChange,
  onBaselineResolved,
}) => {
  const { t } = useTranslation();
  const { data: localPets = [] } = usePets();
  const {
    data: cloudPets,
    isLoading,
    error,
  } = useRemotePets(accountId, true);

  const [petIdOverrides, setPetIdOverrides] = useState<Record<string, number>>(
    {},
  );

  const baseLinks = useMemo(() => {
    if (!cloudPets?.length) return [];
    return buildPetLinksFromCloud(cloudPets, localPets, initialLinks);
  }, [cloudPets, localPets, initialLinks]);

  const displayLinks = useMemo(
    () =>
      baseLinks.map((link) => ({
        ...link,
        pet_id: petIdOverrides[link.external_pet_id] ?? link.pet_id,
      })),
    [baseLinks, petIdOverrides],
  );

  /*
   * Kept in a ref so a caller passing an inline arrow doesn't re-fire the
   * effect below on every render.
   */
  const onBaselineResolvedRef = React.useRef(onBaselineResolved);
  React.useEffect(() => {
    onBaselineResolvedRef.current = onBaselineResolved;
  });

  React.useEffect(() => {
    if (!baseLinks.length) return;
    onBaselineResolvedRef.current?.(petLinksForSave(baseLinks));
  }, [baseLinks]);

  const localPetOptions = [
    { value: UNLINKED_VALUE, label: t('settings.pet_linking_unlinked') },
    ...localPets.map((pet) => ({
      value: String(pet.id),
      label: pet.name,
    })),
  ];

  const updateLink = (externalPetId: string, petId: number) => {
    /*
     * `onChange` sets state in the parent, so it stays out of the updater
     * callback: React invokes updaters during render and twice under
     * StrictMode, which would both warn and double-fire the parent's setter.
     */
    const nextOverrides = { ...petIdOverrides, [externalPetId]: petId };
    setPetIdOverrides(nextOverrides);

    const nextDisplay = baseLinks.map((link) => ({
      ...link,
      pet_id: nextOverrides[link.external_pet_id] ?? link.pet_id,
    }));
    onChange(petLinksForSave(nextDisplay));
  };

  if (isLoading) {
    return (
      <div className="provider-pet-links-editor">
        <p className="loading-row">{t('settings.pet_linking_loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="provider-pet-links-editor">
        <p className="error-row">{t('settings.pet_linking_error')}</p>
      </div>
    );
  }

  if (!cloudPets?.length) {
    return (
      <div className="provider-pet-links-editor">
        <h3 className="section-title">{t('settings.pet_linking_title')}</h3>
        <p className="section-desc">{t('settings.pet_linking_no_remote_pets')}</p>
      </div>
    );
  }

  return (
    <div className="provider-pet-links-editor">
      <h3 className="section-title">{t('settings.pet_linking_title')}</h3>
      <p className="section-desc">{t('settings.pet_linking_desc')}</p>

      <div className="links-table">
        {displayLinks.map((link) => {
          const cloudPet = cloudPets.find(
            (p) => p.external_id === link.external_pet_id,
          );
          const displayName =
            link.remote_name ??
            cloudPet?.name ??
            `#${link.external_pet_id}`;
          const tagId = getTagIdFromLink(link);

          return (
            <div key={link.external_pet_id} className="link-row">
              <div>
                <div className="cloud-pet-name">{displayName}</div>
                {tagId != null && (
                  <div className="cloud-pet-meta">
                    {t('settings.pet_linking_tag_id', { id: tagId })}
                  </div>
                )}
              </div>
              <FormField label={t('settings.pet_linking_local_pet_label')}>
                <Select
                  value={link.pet_id > 0 ? String(link.pet_id) : UNLINKED_VALUE}
                  onChange={(e) =>
                    updateLink(
                      link.external_pet_id,
                      Number.parseInt(e.target.value, 10) || 0,
                    )
                  }
                  options={localPetOptions}
                />
              </FormField>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProviderPetLinksEditor;
