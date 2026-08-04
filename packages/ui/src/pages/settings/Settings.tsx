import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDevices, useProviderAccounts } from '@/hooks/queries/deviceQueries';
import { usePetContext } from '@/hooks/context/usePetContext';
import { AppHeader, AppHeaderBar } from '@/components/ui/AppHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import Avatar from '@/components/ui/Avatar';
import { CardList, CardListItem, CardListContent } from './components/CardList';
import {
  Plus,
  Settings as SettingsIcon,
  Globe,
  Smartphone,
  Database,
  Cat,
  Plug,
  Server,
  Drumstick,
  Timer,
} from 'lucide-react';
import { useFoods } from '@/hooks/queries/foodQueries';
import {
  useSettings,
  useUpdateSettings,
} from '@/hooks/queries/settingsQueries';
import { Input } from '@/components/ui/form/Input';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/form';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { useDraftForm, useUnsavedBlocker } from '@/hooks/form';

import './Settings.css';

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const { pets } = usePetContext();
  const devicesQuery = useDevices();
  const accountsQuery = useProviderAccounts();
  const { data: foods = [] } = useFoods();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  /*
   * Undefined until the query lands, so the row shows no count at all rather
   * than claiming "0 connected accounts" on every cold load.
   */
  const visibleAccountCount = accountsQuery.data?.filter(
    (a) => !a.internal,
  ).length;
  const deviceCount = devicesQuery.data?.length;

  const trackingGapBaseline = String(
    settings?.tracking_gap_threshold_minutes ?? '',
  );
  const {
    draft: trackingGapInput,
    setDraft: setTrackingGapInput,
    isDirty: trackingGapDirty,
    commit: commitTrackingGap,
    requestReset: requestTrackingGapReset,
    discardConfirm: trackingGapDiscardConfirm,
  } = useDraftForm(trackingGapBaseline, {
    baselineKey: trackingGapBaseline,
  });
  const parsedTrackingGap = Number.parseInt(trackingGapInput, 10);
  const trackingGapIsValid =
    Number.isFinite(parsedTrackingGap) && parsedTrackingGap >= 0;

  const { blockerOpen, onConfirmLeave, onCancelLeave } =
    useUnsavedBlocker(trackingGapDirty);

  const handleSaveTrackingGap = () => {
    if (!trackingGapIsValid) return;
    updateSettings.mutate(
      { tracking_gap_threshold_minutes: parsedTrackingGap },
      {
        onSuccess: () => {
          setTrackingGapInput(String(parsedTrackingGap));
          // The settings query still holds the old threshold until it refetches;
          // without this the row stays "dirty" and guards navigation after a save.
          commitTrackingGap();
        },
      },
    );
  };

  return (
    <div className="page-settings">
      <AppHeader>
        <AppHeaderBar title={t('navigation.settings')} />
      </AppHeader>

      <div className="settings-container">
        <section>
          <SectionHeader icon={<Cat size="1em" />}>
            {t('settings.pets')}
          </SectionHeader>
          <CardList>
            {pets.map((pet) => (
              <CardListItem
                key={pet.id}
                icon={
                  <Avatar
                    src={pet.avatar_url}
                    alt={pet.name}
                    fallbackIcon={<Cat size="1em" />}
                  />
                }
                to={`/settings/pets/${pet.id}`}
              >
                <CardListContent title={pet.name} description={pet.breed} />
              </CardListItem>
            ))}
            <CardListItem
              icon={
                <div className="add-item-icon">
                  <Plus size="0.5em" />
                </div>
              }
              to="/settings/pets/new"
            >
              <CardListContent
                title={t('settings.add_pet')}
                description={t('settings.add_pet_desc')}
              />
            </CardListItem>
          </CardList>
        </section>
        {/*
         * Providers and devices are two views of the same thing — what feeds
         * data in — so they share a section rather than each owning a heading
         * with a single row under it.
         */}
        <section>
          <SectionHeader icon={<Plug size="1em" />}>
            {t('settings.integrations')}
          </SectionHeader>
          <CardList>
            <CardListItem icon={<Server size="1em" />} to="/settings/providers">
              <CardListContent
                title={t('settings.providers')}
                description={
                  accountsQuery.isError
                    ? t('settings.error_loading_providers')
                    : visibleAccountCount === undefined
                      ? undefined
                      : t('settings.providers_summary', {
                          count: visibleAccountCount,
                          accounts: visibleAccountCount,
                        })
                }
              />
            </CardListItem>
            <CardListItem
              icon={<Smartphone size="1em" />}
              to="/settings/devices"
            >
              <CardListContent
                title={t('settings.devices')}
                description={
                  devicesQuery.isError
                    ? t('settings.error_loading_devices')
                    : deviceCount === undefined
                      ? undefined
                      : t('settings.device_count', { count: deviceCount })
                }
              />
            </CardListItem>
          </CardList>
        </section>
        <section>
          <SectionHeader icon={<Drumstick size="1em" />}>
            {t('settings.foods')}
          </SectionHeader>
          <CardList>
            {foods.map((food) => (
              <CardListItem
                key={food.id}
                icon={<Drumstick size="1em" />}
                to={`/settings/foods/${food.id}`}
              >
                <CardListContent
                  title={food.name}
                  description={
                    food.brand
                      ? `${food.brand} · ${t(`settings.food_type_${food.food_type}`)}`
                      : t(`settings.food_type_${food.food_type}`)
                  }
                />
              </CardListItem>
            ))}
            <CardListItem
              icon={
                <div className="add-item-icon">
                  <Plus size="0.5em" />
                </div>
              }
              to="/settings/foods/new"
            >
              <CardListContent
                title={t('settings.add_food')}
                description={t('settings.add_food_desc')}
              />
            </CardListItem>
          </CardList>
        </section>
        <section>
          <SectionHeader icon={<Globe size="1em" />}>
            {t('settings.app_settings')}
          </SectionHeader>
          <CardList>
            <CardListItem
              icon={<Globe size="1em" />}
              to="/settings/language-region"
            >
              <CardListContent
                title={t('settings.language_region')}
                description={t('settings.language_region_desc')}
              />
            </CardListItem>
            <CardListItem
              icon={<Timer size="1em" />}
              trailing={
                <div className="settings-tracking-gap-editor">
                  <Input
                    className="settings-tracking-gap-input"
                    type="number"
                    inputSize="sm"
                    min={0}
                    step={15}
                    value={trackingGapInput}
                    onChange={(event) => {
                      setTrackingGapInput(event.target.value);
                    }}
                    disabled={updateSettings.isPending}
                    aria-label={t('settings.tracking_gap_threshold_label')}
                  />
                  {trackingGapDirty ? (
                    <div className="settings-tracking-gap-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={updateSettings.isPending}
                        onClick={requestTrackingGapReset}
                      >
                        {t('settings.cancel')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          updateSettings.isPending || !trackingGapIsValid
                        }
                        onClick={handleSaveTrackingGap}
                      >
                        {updateSettings.isPending
                          ? t('settings.saving')
                          : t('common.save')}
                      </Button>
                    </div>
                  ) : null}
                </div>
              }
            >
              <CardListContent
                title={t('settings.tracking_gap_threshold_label')}
                description={t('settings.tracking_gap_threshold_desc')}
              />
            </CardListItem>
            <CardListItem icon={<SettingsIcon size="1em" />}>
              <CardListContent
                title={t('settings.notifications')}
                description={t('settings.notifications_desc')}
              />
            </CardListItem>
            <FormError
              message={
                trackingGapDirty && !trackingGapIsValid
                  ? t('settings.tracking_gap_invalid')
                  : updateSettings.isError
                    ? t('settings.tracking_gap_save_error')
                    : null
              }
            />
          </CardList>
        </section>
        <section>
          <SectionHeader icon={<Database size="1em" />}>
            {t('settings.data_management')}
          </SectionHeader>
          <CardList>
            <CardListItem icon={<Database size="1em" />}>
              <CardListContent
                title={t('settings.export_data')}
                description={t('settings.export_data_desc')}
              />
            </CardListItem>
            <CardListItem icon={<SettingsIcon size="1em" />}>
              <CardListContent
                title={t('settings.reset_options')}
                description={t('settings.reset_options_desc')}
              />
            </CardListItem>
          </CardList>
        </section>
      </div>
      <DiscardUnsavedDialog
        open={blockerOpen}
        onConfirm={onConfirmLeave}
        onCancel={onCancelLeave}
      />
      <DiscardUnsavedDialog {...trackingGapDiscardConfirm} />
    </div>
  );
};

export default Settings;
