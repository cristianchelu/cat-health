import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Clock, LayoutGrid, Settings, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AppHeader, AppHeaderBar } from '@/components/ui/AppHeader';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { useUnsavedBlocker } from '@/hooks/form';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { DeviceHeader } from './components/DeviceHeader';
import { ProviderDeviceView } from './components/ProviderDeviceView';
import { DeviceTimeline } from './components/DeviceTimeline';
import CameraLinkSection from './components/CameraLinkSection';
import FeederFoodSection from './components/FeederFoodSection';
import ReferenceImagesTab from './components/ReferenceImagesTab';
import './DeviceDetails.css';
import { useDevice } from '@/hooks/queries/deviceQueries';
import { parseDeviceRouteId } from './parseDeviceRouteId.ts';

const DeviceDetails: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const deviceId = parseDeviceRouteId(id);
  const invalidId = deviceId == null;
  const back = useBackNavigation({
    to: '/devices',
    label: t('navigation.devices'),
  });
  const [activeTab, setActiveTab] = React.useState('overview');
  const [pendingTab, setPendingTab] = React.useState<string | null>(null);
  const [cameraDirty, setCameraDirty] = React.useState(false);
  const [feederDirty, setFeederDirty] = React.useState(false);
  const settingsDirty = cameraDirty || feederDirty;
  const { blockerOpen, onConfirmLeave, onCancelLeave } =
    useUnsavedBlocker(settingsDirty);

  const {
    data: device,
    isLoading,
    error,
  } = useDevice(deviceId ?? 0, !invalidId);

  const handleTabChange = (nextTab: string) => {
    if (activeTab === 'settings' && nextTab !== 'settings' && settingsDirty) {
      setPendingTab(nextTab);
      return;
    }
    setActiveTab(nextTab);
  };

  if (isLoading) {
    return (
      <div className="page-shell-narrow">
        <AppHeader>
          <AppHeaderBar
            back={{ to: back.to, label: back.label, onNavigate: back.go }}
            title={t('devices.loading_device')}
          />
        </AppHeader>
        <p>{t('devices.loading_device')}</p>
      </div>
    );
  }

  if (invalidId || error || !device) {
    return (
      <div className="page-shell-narrow">
        <AppHeader>
          <AppHeaderBar
            back={{ to: back.to, label: back.label, onNavigate: back.go }}
            title={t('devices.error_loading_device')}
          />
        </AppHeader>
        <p>{t('devices.error_loading_device')}</p>
        <Button onClick={back.go}>{t('devices.back_to_devices')}</Button>
      </div>
    );
  }

  return (
    <div className="device-details-page">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="device-tabs"
      >
        {/*
          The tab list is handed to the header rather than rendered here: it
          belongs to the app bar's bottom edge, which is what a nudge up brings
          back once the title has scrolled away.
        */}
        <DeviceHeader
          device={device}
          tabs={
            <TabsList>
              <TabsTrigger value="overview">
                <LayoutGrid size={15} aria-hidden="true" />
                {t('devices.tab_overview')}
              </TabsTrigger>
              <TabsTrigger value="history">
                <Clock size={15} aria-hidden="true" />
                {t('devices.tab_history')}
              </TabsTrigger>
              {device.type === 'pet_recognizer' && (
                <TabsTrigger value="reference-images">
                  <Sparkles size={15} aria-hidden="true" />
                  {t('pet_recognizer.tab_label')}
                </TabsTrigger>
              )}
              <TabsTrigger value="settings">
                <Settings size={15} aria-hidden="true" />
                {t('devices.tab_settings')}
              </TabsTrigger>
            </TabsList>
          }
        />
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
