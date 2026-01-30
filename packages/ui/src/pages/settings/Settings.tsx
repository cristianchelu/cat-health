import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { DeviceType } from 'shared';
import { useDevices, useProviderAccounts } from '@/hooks/queries/deviceQueries';
import { usePetContext } from '@/hooks/context/usePetContext';
import { SectionHeader } from '@/components/ui/SectionHeader';
import Avatar from '@/components/ui/Avatar';
import { LitterboxIcon } from '@/components/icons/LitterboxIcon';
import { WaterFountainIcon } from '@/components/icons/WaterFountainIcon';
import { CardList, CardListItem, CardListContent } from './components/CardList';
import {
  Plus,
  Settings as SettingsIcon,
  Globe,
  Smartphone,
  Database,
  Cat,
  CctvIcon,
  Server,
  Drumstick,
} from 'lucide-react';
import { useFoods } from '@/hooks/queries/foodQueries';

import './Settings.css';

const DEVICE_ICON: Record<DeviceType, React.ReactNode> = {
  litterbox: <LitterboxIcon size="1em" />,
  water_fountain: <WaterFountainIcon size="1em" />,
  feeder: <SettingsIcon size="1em" />,
  camera: <CctvIcon size="1em" />,
};

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const { pets } = usePetContext();
  const { data: devices = [] } = useDevices();
  const { data: accounts = [] } = useProviderAccounts();
  const { data: foods = [] } = useFoods();
  const navigate = useNavigate();

  const visibleAccounts = accounts.filter((a) => !a.internal);

  const handleAddPet = () => {
    navigate('/settings/pets/new');
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
              const icon = DEVICE_ICON[device.type] || (
                <SettingsIcon size="1em" />
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
            <CardListItem icon={<Globe size="1em" />}>
              <CardListContent
                title={t('settings.language_region')}
                description={t('settings.language_region_desc')}
              />
            </CardListItem>
            <CardListItem icon={<Smartphone size="1em" />}>
              <CardListContent
                title={t('settings.timezone')}
                description={t('settings.timezone_desc')}
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
