import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useDevices, useProviderAccounts } from '@/hooks/queries/deviceQueries';
import { usePetContext } from '@/hooks/context/usePetContext';
import { SectionHeader } from '@/components/ui/SectionHeader';
import Avatar from '@/components/ui/Avatar';
import { getDeviceIcon } from '@/components/icons/deviceIcons';
import { CardList, CardListItem, CardListContent } from './components/CardList';
import {
  Plus,
  Settings as SettingsIcon,
  Globe,
  Smartphone,
  Database,
  Cat,
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

import './Settings.css';

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const { pets } = usePetContext();
  const { data: devices = [] } = useDevices();
  const { data: accounts = [] } = useProviderAccounts();
  const { data: foods = [] } = useFoods();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const navigate = useNavigate();

  const visibleAccounts = accounts.filter((a) => !a.internal);

  const handleAddPet = () => {
    navigate('/settings/pets/new');
  };

  const [trackingGapInput, setTrackingGapInput] = React.useState('');

  React.useEffect(() => {
    if (settings?.tracking_gap_threshold_minutes !== undefined) {
      setTrackingGapInput(String(settings.tracking_gap_threshold_minutes));
    }
  }, [settings?.tracking_gap_threshold_minutes]);

  const handleTrackingGapBlur = () => {
    const value = Number.parseInt(trackingGapInput, 10);
    if (Number.isNaN(value) || value < 0) {
      setTrackingGapInput(
        String(settings?.tracking_gap_threshold_minutes ?? ''),
      );
      return;
    }

    if (value === settings?.tracking_gap_threshold_minutes) {
      return;
    }

    updateSettings.mutate({ tracking_gap_threshold_minutes: value });
  };

  return (
    <div className="page-settings">
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
                onClick={() => navigate(`/settings/pets/${pet.id}`)}
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
              onClick={handleAddPet}
            >
              <CardListContent
                title={t('settings.add_pet')}
                description={t('settings.add_pet_desc')}
              />
            </CardListItem>
          </CardList>
        </section>
        <section>
          <SectionHeader icon={<Server size="1em" />}>
            {t('settings.providers')}
          </SectionHeader>
          <CardList>
            {visibleAccounts.map((account) => (
              <CardListItem
                key={account.id}
                icon={<Server size="1em" />}
                onClick={() => navigate(`/settings/providers/${account.id}`)}
              >
                <CardListContent
                  title={account.name}
                  description={`${account.provider} - ${account.enabled ? t('settings.enabled') : t('settings.disabled')}`}
                />
              </CardListItem>
            ))}
            <CardListItem
              icon={
                <div className="add-item-icon">
                  <Plus size="0.5em" />
                </div>
              }
              onClick={() => navigate('/settings/providers/new')}
            >
              <CardListContent
                title={t('settings.add_provider')}
                description={t('settings.add_provider_desc')}
              />
            </CardListItem>
          </CardList>
        </section>
        <section>
          <SectionHeader icon={<Smartphone size="1em" />}>
            {t('settings.devices')}
          </SectionHeader>
          <CardList>
            {devices.map((device) => {
              const icon = getDeviceIcon(
                device.type,
                <SettingsIcon size="1em" />,
              );
              return (
                <CardListItem
                  key={device.id}
                  icon={icon}
                  onClick={() => navigate(`/settings/devices/${device.id}`)}
                >
                  <CardListContent
                    title={device.name}
                    description={t(`device_types.${device.type}`)}
                  />
                </CardListItem>
              );
            })}
            <CardListItem
              icon={
                <div className="add-item-icon">
                  <Plus size="0.5em" />
                </div>
              }
              onClick={() => navigate('/settings/devices/new')}
            >
              <CardListContent
                title={t('settings.add_device')}
                description={t('settings.add_device_desc')}
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
                onClick={() => navigate(`/settings/foods/${food.id}`)}
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
              onClick={() => navigate('/settings/foods/new')}
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
              onClick={() => navigate('/settings/language-region')}
            >
              <CardListContent
                title={t('settings.language_region')}
                description={t('settings.language_region_desc')}
              />
            </CardListItem>
            <CardListItem
              icon={<Timer size="1em" />}
              trailing={
                <Input
                  className="settings-tracking-gap-input"
                  type="number"
                  inputSize="sm"
                  min={0}
                  step={15}
                  value={trackingGapInput}
                  onChange={(event) => setTrackingGapInput(event.target.value)}
                  onBlur={handleTrackingGapBlur}
                  aria-label={t('settings.tracking_gap_threshold_label')}
                />
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
    </div>
  );
};

export default Settings;
