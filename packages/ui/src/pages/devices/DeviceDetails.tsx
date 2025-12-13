import * as React from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { DeviceHeader } from './components/DeviceHeader';
import { ProviderDeviceView } from './components/ProviderDeviceView';
import { DeviceTimeline } from './components/DeviceTimeline';
import CameraLinkSection from './components/CameraLinkSection';
import './DeviceDetails.css';
import { useDevice } from '@/hooks/queries/deviceQueries';

const DeviceDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const deviceId = id ? parseInt(id, 10) : null;

  const { data: device, isLoading, error } = useDevice(deviceId!, !!deviceId);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error || !device) {
    return (
      <div>
        <div>Error loading device</div>
        <Button onClick={() => navigate('/devices')}>Back to Devices</Button>
      </div>
    );
  }

  return (
    <div className="device-details-page">
      <DeviceHeader device={device} />
      <Tabs defaultValue="overview" className="device-tabs">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="device-content">
            <ProviderDeviceView device={device} />
          </div>
        </TabsContent>
        <TabsContent value="history">
          <DeviceTimeline deviceId={device.id} />
        </TabsContent>
        <TabsContent value="settings">
          <div className="device-content">
            <CameraLinkSection device={device} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DeviceDetails;
