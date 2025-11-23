import React from 'react';
import { useNavigate } from 'react-router';
import type { DeviceType } from 'shared';
import { usePets } from '@/hooks/queries/petQueries';
import { useDevices, useProviderAccounts } from '@/hooks/queries/deviceQueries';
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
} from 'lucide-react';

import './Settings.css';

const DEVICE_ICON: Record<DeviceType, React.ReactNode> = {
  litterbox: <LitterboxIcon size="1em" />,
  water_fountain: <WaterFountainIcon size="1em" />,
  feeder: <SettingsIcon size="1em" />,
  camera: <CctvIcon size="1em" />,
};

const Settings: React.FC = () => {
  const { data: pets = [] } = usePets();
  const { data: devices = [] } = useDevices();
  const { data: accounts = [] } = useProviderAccounts();
  const navigate = useNavigate();

  const visibleAccounts = accounts.filter((a) => !a.internal);

  const handleAddPet = () => {
    navigate('/settings/pets/new');
  };

  return (
    <div className="page-settings">
      <div className="settings-container">
        <section>
          <SectionHeader icon={<Cat size="1em" />}>Pets</SectionHeader>
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
                title="Add Pet"
                description="Add another pet to your household"
              />
            </CardListItem>
          </CardList>
        </section>
        <section>
          <SectionHeader icon={<Server size="1em" />}>Providers</SectionHeader>
          <CardList>
            {visibleAccounts.map((account) => (
              <CardListItem
                key={account.id}
                icon={<Server size="1em" />}
                onClick={() => navigate(`/settings/providers/${account.id}`)}
              >
                <CardListContent
                  title={account.name}
                  description={`${account.provider} - ${account.enabled ? 'Enabled' : 'Disabled'}`}
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
                title="Add Provider"
                description="Connect a new service (e.g. ESPHome)"
              />
            </CardListItem>
          </CardList>
        </section>
        <section>
          <SectionHeader icon={<Smartphone size="1em" />}>
            Devices
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
                    description={device.type}
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
                title="Add Device"
                description="Connect a smart litterbox or other device"
              />
            </CardListItem>
          </CardList>
        </section>
        <section>
          <SectionHeader icon={<Globe size="1em" />}>
            App Settings
          </SectionHeader>
          <CardList>
            <CardListItem icon={<Globe size="1em" />}>
              <CardListContent
                title="Language & Region"
                description="Set your preferred language and regional settings"
              />
            </CardListItem>
            <CardListItem icon={<Smartphone size="1em" />}>
              <CardListContent
                title="Timezone"
                description="Configure your local timezone for accurate tracking"
              />
            </CardListItem>
            <CardListItem icon={<SettingsIcon size="1em" />}>
              <CardListContent
                title="Notifications"
                description="Manage alerts and reminders for your pets"
              />
            </CardListItem>
          </CardList>
        </section>
        <section>
          <SectionHeader icon={<Database size="1em" />}>
            Data Management
          </SectionHeader>
          <CardList>
            <CardListItem icon={<Database size="1em" />}>
              <CardListContent
                title="Export Data"
                description="Download your pet health data and reports"
              />
            </CardListItem>
            <CardListItem icon={<SettingsIcon size="1em" />}>
              <CardListContent
                title="Reset Options"
                description="Clear data or reset app settings"
              />
            </CardListItem>
          </CardList>
        </section>
      </div>
    </div>
  );
};

export default Settings;
