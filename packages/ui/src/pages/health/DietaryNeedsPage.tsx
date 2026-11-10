import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PutDietaryNeedsRequest } from 'shared';

import { EmptyState } from '@/components/ui/PageState';
import { SettingsFormPage } from '@/components/ui/SettingsFormPage';
import { usePetContext } from '@/hooks/context/usePetContext';
import { useRegionalPreferences } from '@/hooks/context/useRegionalPreferences';
import {
  usePetDietaryNeeds,
  useSavePetDietaryNeeds,
} from '@/hooks/queries/petQueries';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { formatCalendarDate } from '@/lib/utils';

import { DietaryNeedsForm } from './components/DietaryNeedsForm';
import './DietaryNeedsPage.css';

/** The selected pet's dietary needs: the page chrome, the query and the save. */
const DietaryNeedsPage: React.FC = () => {
  const { t } = useTranslation();
  const { selectedPet } = usePetContext();
  const { timezone } = useRegionalPreferences();
  const back = useBackNavigation({
    to: '/health',
    label: t('navigation.health'),
  });

  const petId = selectedPet?.id ?? 0;
  const { data: needs } = usePetDietaryNeeds(petId);
  const saveMutation = useSavePetDietaryNeeds(petId);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const handleSave = async (change: PutDietaryNeedsRequest) => {
    setSaveError(null);
    try {
      await saveMutation.mutateAsync(change);
      return true;
    } catch {
      setSaveError(t('health.dietary_needs.save_error'));
      return false;
    }
  };

  const content = () => {
    if (!selectedPet || !needs) return null;
    if (needs.weight_kg === null) {
      return (
        <EmptyState
          message={t('health.dietary_needs.never_weighed', {
            pet: selectedPet.name,
          })}
        />
      );
    }
    return (
      /* Keyed per pet: the form seeds its draft once per mount. */
      <DietaryNeedsForm
        key={petId}
        pet={selectedPet}
        needs={needs}
        weightKg={needs.weight_kg}
        today={formatCalendarDate(new Date(), timezone)}
        onSave={handleSave}
        onCancel={back.go}
        error={saveError}
        isSaving={saveMutation.isPending}
      />
    );
  };

  return (
    <SettingsFormPage
      className="page-dietary-needs"
      title={
        selectedPet
          ? t('health.dietary_needs.page_title', { pet: selectedPet.name })
          : undefined
      }
      back={{ to: back.to, label: back.label, onNavigate: back.go }}
      isLoading={!selectedPet || !needs}
      loadingMessage={t('health.dietary_needs.loading')}
    >
      {content()}
    </SettingsFormPage>
  );
};

export default DietaryNeedsPage;
