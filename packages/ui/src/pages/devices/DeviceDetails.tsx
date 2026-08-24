import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import {
  Camera,
  Clock,
  LayoutGrid,
  ScanSearch,
  Settings,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AppHeader, AppHeaderBar } from '@/components/ui/AppHeader';
import { DiscardUnsavedDialog } from '@/components/ui/DiscardUnsavedDialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { useUnsavedBlocker } from '@/hooks/form';
import { useBackNavigation } from '@/hooks/useBackNavigation';
import { shouldBlockDeviceDetailsTabLeave } from '@/lib/deviceDetailsDirty';
import {
  getDeviceDetailsTabs,
  type DeviceDetailsTabId,
} from '@/lib/deviceDetailsTabs';
import { DeviceHeader } from './components/DeviceHeader';
import { ProviderDeviceView } from './components/ProviderDeviceView';
import { DeviceTimeline } from './components/DeviceTimeline';
import CameraTab from './components/CameraTab';
import FeederSettingsTab from './components/FeederSettingsTab';
import ReferenceImagesTab from './components/ReferenceImagesTab';
import RecognitionTab from './components/RecognitionTab';
import './DeviceDetails.css';
import { useDevice } from '@/hooks/queries/deviceQueries';
import { parseDeviceRouteId } from './parseDeviceRouteId.ts';

const TAB_ICONS: Record<DeviceDetailsTabId, React.ReactNode> = {
  overview: <LayoutGrid size={15} aria-hidden="true" />,
  history: <Clock size={15} aria-hidden="true" />,
  camera: <Camera size={15} aria-hidden="true" />,
  recognition: <ScanSearch size={15} aria-hidden="true" />,
  'reference-images': <Sparkles size={15} aria-hidden="true" />,
  settings: <Settings size={15} aria-hidden="true" />,
};

const DeviceDetails: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const deviceId = parseDeviceRouteId(id);
  const invalidId = deviceId == null;
  const back = useBackNavigation({
    to: '/devices',
    label: t('navigation.devices'),
  });
  const [activeTab, setActiveTab] =
    React.useState<DeviceDetailsTabId>('overview');
  const [pendingTab, setPendingTab] = React.useState<DeviceDetailsTabId | null>(
    null,
  );
  const [cameraDirty, setCameraDirty] = React.useState(false);
  const [recognitionDirty, setRecognitionDirty] = React.useState(false);
  const [feederDirty, setFeederDirty] = React.useState(false);
  const { blockerOpen, onConfirmLeave, onCancelLeave } = useUnsavedBlocker(
    cameraDirty || recognitionDirty || feederDirty,
  );

  const {
    data: device,
    isLoading,
    error,
  } = useDevice(deviceId ?? 0, !invalidId);

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

  const visibleTabs = getDeviceDetailsTabs(device);
  // Tab state can outlive the device it was picked for (history navigation
  // between /devices/:id routes reuses this element), so an id that the
  // current device doesn't offer falls back to overview.
  const effectiveTab = visibleTabs.includes(activeTab) ? activeTab : 'overview';

  const handleTabChange = (nextTab: string) => {
    const next = nextTab as DeviceDetailsTabId;
    if (
      shouldBlockDeviceDetailsTabLeave({
        activeTab: effectiveTab,
        nextTab: next,
        cameraDirty,
        recognitionDirty,
        feederDirty,
      })
    ) {
      setPendingTab(next);
      return;
    }
    setActiveTab(next);
  };

  const tabLabel = (tabId: DeviceDetailsTabId): string => {
    switch (tabId) {
      case 'overview':
        return t('devices.tab_overview');
      case 'history':
        return t('devices.tab_history');
      case 'camera':
        return t('devices.tab_camera');
      case 'recognition':
        return t('devices.tab_recognition');
      case 'reference-images':
        return t('pet_recognizer.tab_label');
      case 'settings':
        return t('devices.tab_settings');
    }
  };

  return (
    <div className="page-device-details">
      <Tabs
        value={effectiveTab}
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
              {visibleTabs.map((tabId) => (
                <TabsTrigger key={tabId} value={tabId}>
                  {TAB_ICONS[tabId]}
                  {tabLabel(tabId)}
                </TabsTrigger>
              ))}
            </TabsList>
          }
        />
        {visibleTabs.includes('overview') && (
          <TabsContent value="overview">
            <div className="device-content">
              <ProviderDeviceView device={device} />
            </div>
          </TabsContent>
        )}
        {visibleTabs.includes('history') && (
          <TabsContent value="history">
            <DeviceTimeline deviceId={device.id} />
          </TabsContent>
        )}
        {visibleTabs.includes('camera') && (
          <TabsContent value="camera">
            <div className="device-content device-settings-content">
              <CameraTab device={device} onDirtyChange={setCameraDirty} />
            </div>
          </TabsContent>
        )}
        {visibleTabs.includes('recognition') && (
          <TabsContent value="recognition">
            <div className="device-content device-settings-content">
              <RecognitionTab
                device={device}
                onDirtyChange={setRecognitionDirty}
                onGoToCamera={() => handleTabChange('camera')}
              />
            </div>
          </TabsContent>
        )}
        {visibleTabs.includes('reference-images') && (
          <TabsContent value="reference-images">
            <ReferenceImagesTab device={device} />
          </TabsContent>
        )}
        {visibleTabs.includes('settings') && (
          <TabsContent value="settings">
            <div className="device-content device-settings-content">
              <FeederSettingsTab
                device={device}
                onDirtyChange={setFeederDirty}
              />
            </div>
          </TabsContent>
        )}
      </Tabs>
      <DiscardUnsavedDialog
        open={pendingTab != null}
        onConfirm={() => {
          const nextTab = pendingTab;
          setPendingTab(null);
          setCameraDirty(false);
          setRecognitionDirty(false);
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
