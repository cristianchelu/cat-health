import { Link } from 'react-router';

import type { DeviceType } from '@cat-health/shared';

import { Card, CardContent, CardTitle } from '@/components/ui/Card';
import { useDevices } from '@/hooks/queries/deviceQueries';

import './DeviceList.css';

const getDeviceTypeLabel = (type: DeviceType) => {
  switch (type) {
    case "litterbox":
      return "Litter Box";
    case "feeder":
      return "Feeder";
    case "water_fountain":
      return "Water Fountain";
    default:
      return type;
  }
};

export default function DeviceList() {
  const { data, isLoading, error } = useDevices();

  if (isLoading) return <div className="device-list"><div className="loading">Loading...</div></div>;
  if (error) return <div className="device-list"><div className="error">Error loading devices.</div></div>;
  if (!Array.isArray(data)) return <div className="device-list"><div className="empty">No devices found.</div></div>;

  return (
    <div className="device-list">
      <h2 className="title">Device List</h2>
      <div className="grid">
        {data?.map((device) => (
          <Link key={device.id} to={`/devices/${device.id}`} className="card-link">
            <Card>
              <CardTitle>{device.name}</CardTitle>
              <CardContent>
                <div><b>Type:</b> {getDeviceTypeLabel(device.type)}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}