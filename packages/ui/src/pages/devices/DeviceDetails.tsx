import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { useUnsavedBlocker } from '@/hooks/form';
import { DeviceHeader } from './components/DeviceHeader';
import { ProviderDeviceView } from './components/ProviderDeviceView';
import { DeviceTimeline } from './components/DeviceTimeline';
import CameraLinkSection from './components/CameraLinkSection';
import FeederFoodSection from './components/FeederFoodSection';
import ReferenceImagesTab from './components/ReferenceImagesTab';
import './DeviceDetails.css';
import { useDevice } from '@/hooks/queries/deviceQueries';

const DeviceDetails: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const deviceId = id ? parseInt(id, 10) : null;
  const [activeTab, setActiveTab] = React.useState('overview');
  const [pendingTab, setPendingTab] = React.useState<string | null>(null);
  const [cameraDirty, setCameraDirty] = React.useState(false);
  const [feederDirty, setFeederDirty] = React.useState(false);
  const settingsDirty = cameraDirty || feederDirty;
  const { blockerOpen, onConfirmLeave, onCancelLeave } =
    useUnsavedBlocker(settingsDirty);

  const { data: device, isLoading, error } = useDevice(deviceId!, !!deviceId);

  const handleTabChange = (nextTab: string) => {
    if (activeTab === 'settings' && nextTab !== 'settings' && settingsDirty) {
      setPendingTab(nextTab);
      return;
    }
    setActiveTab(nextTab);
  };

  if (isLoading) {
    return <div>{t('devices.loading_device')}</div>;
  }

  if (error || !device) {
    return (
      <div>
        <div>{t('devices.error_loading_device')}</div>
        <Button onClick={() => navigate('/devices')}>
          {t('devices.back_to_devices')}
        </Button>
      </div>
    );
  }

  return (
    <div className="device-details-page">
      <DeviceHeader device={device} />
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="device-tabs"
      >
        <TabsList>
          <TabsTrigger value="overview">
            {t('devices.tab_overview')}
          </TabsTrigger>
          <TabsTrigger value="history">{t('devices.tab_history')}</TabsTrigger>
          {device.type === 'pet_recognizer' && (
            <TabsTrigger value="reference-images">
              {t('pet_recognizer.tab_label')}
            </TabsTrigger>
          )}
          <TabsTrigger value="settings">
            {t('devices.tab_settings')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="device-content">
            <ProviderDeviceView device={device} />
          </div>
        </TabsContent>
        <TabsContent value="history">
          <DeviceTimeline deviceId={device.id} />
        </TabsContent>
        {device.type === 'pet_recognizer' && (
          <TabsContent value="reference-images">
            <ReferenceImagesTab device={device} />
          </TabsContent>
        )}
        <TabsContent value="settings">
          <div className="device-content device-settings-content">
            {device.type === 'feeder' && (
              <FeederFoodSection
                device={device}
                onDirtyChange={setFeederDirty}
              />
            )}
            <CameraLinkSection device={device} onDirtyChange={setCameraDirty} />
          </div>
        </TabsContent>
      </Tabs>
      <DiscardUnsavedDialog
        open={pendingTab != null}
        onConfirm={() => {
          const nextTab = pendingTab;
          setPendingTab(null);
          setCameraDirty(false);
          setFeederDirty(false);
          if (nextTab) setActiveTab(nextTab);
        }}
        onCancel={() => setPendingTab(null)}
      />
      <DiscardUnsavedDialog
        open={blockerOpen}
        onConfirm={onConfirmLeave}
        onCancel={onCancelLeave}
      />
    </div>
  );
};

export default DeviceDetails;
