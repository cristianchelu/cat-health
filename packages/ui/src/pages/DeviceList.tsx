import { Link } from 'react-router';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { getDeviceTypeLabel } from '@/lib/utils';
import { useDevices } from '@/hooks/queries/deviceQueries';

import './DeviceList.css';

export default function DeviceList() {
  const { data, isLoading, error } = useDevices();

  if (isLoading) return <div className="device-list"><div className="loading">Loading...</div></div>;
  if (error) return <div className="device-list"><div className="error">Error loading devices.</div></div>;
  if (!Array.isArray(data)) return <div className="device-list"><div className="empty">No devices found.</div></div>;

  return (
    <div className="device-list">
      <h2>Your devices</h2>
      <div className="grid">
        {data?.map((device) => (
          <Link key={device.id} to={`/devices/${device.id}`} className="card-link">
            <Card>
              <CardHeader>
                <CardTitle>{device.name}</CardTitle>
              </CardHeader>
              <CardContent className='details'>
                <p><b>Type:</b> {getDeviceTypeLabel(device.type)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}