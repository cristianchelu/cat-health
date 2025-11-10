import React from 'react';
import { usePets } from '@/hooks/queries/petQueries';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { CardList, CardListItem, CardListContent } from './components/CardList';
import {
  Plus,
  Settings as SettingsIcon,
  Globe,
  Smartphone,
  Database,
  Cat,
} from 'lucide-react';

import './Settings.css';

const Settings: React.FC = () => {
  const { data: pets = [] } = usePets();

  return (
    <div className="page-settings">
      <div className="settings-container">
        <section>
          <SectionHeader icon={<Cat size={20} />}>Pets</SectionHeader>
          <CardList>
            {pets.map((pet) => (
              <CardListItem key={pet.id} icon={<Cat size={20} />}>
                <CardListContent title={pet.name} description={pet.breed} />
              </CardListItem>
            ))}
            <CardListItem
              icon={
                <div className="add-item-icon">
                  <Plus size={20} />
                </div>
              }
            >
              <CardListContent
                title="Add Pet"
                description="Add another pet to your household"
              />
            </CardListItem>
          </CardList>
        </section>
        <section>
          <SectionHeader icon={<Smartphone size={20} />}>Devices</SectionHeader>
          <CardList>
            <CardListItem
              icon={
                <div className="add-item-icon">
                  <Plus size={20} />
                </div>
              }
            >
              <CardListContent
                title="Add Device"
                description="Connect a smart litterbox or other device"
              />
            </CardListItem>
          </CardList>
        </section>
        <section>
          <SectionHeader icon={<Globe size={20} />}>App Settings</SectionHeader>
          <CardList>
            <CardListItem icon={<Globe size={20} />}>
              <CardListContent
                title="Language & Region"
                description="Set your preferred language and regional settings"
              />
            </CardListItem>
            <CardListItem icon={<Smartphone size={20} />}>
              <CardListContent
                title="Timezone"
                description="Configure your local timezone for accurate tracking"
              />
            </CardListItem>
            <CardListItem icon={<SettingsIcon size={20} />}>
              <CardListContent
                title="Notifications"
                description="Manage alerts and reminders for your pets"
              />
            </CardListItem>
          </CardList>
        </section>
        <section>
          <SectionHeader icon={<Database size={20} />}>
            Data Management
          </SectionHeader>
          <CardList>
            <CardListItem icon={<Database size={20} />}>
              <CardListContent
                title="Export Data"
                description="Download your pet health data and reports"
              />
            </CardListItem>
            <CardListItem icon={<SettingsIcon size={20} />}>
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
