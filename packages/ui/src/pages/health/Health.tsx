import React from 'react';
import { useTranslation } from 'react-i18next';

import {
  AppHeader,
  AppHeaderBar,
  AppHeaderRow,
} from '@/components/ui/AppHeader';
import PetSelector from '@/components/navigation/PetSelector';

import './Health.css';

const Health: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="page-health">
      {/* Same chrome as the overview: on a phone the pet strip is the app bar. */}
      <AppHeader>
        <AppHeaderBar desktopOnly title={t('navigation.health')} />
        <AppHeaderRow>
          <PetSelector variant="mobile" />
        </AppHeaderRow>
      </AppHeader>
    </div>
  );
};

export default Health;
