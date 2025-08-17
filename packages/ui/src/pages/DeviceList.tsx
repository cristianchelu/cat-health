import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { getDevices } from '@/api/devices';
import { Card, CardContent, CardTitle } from '@/components/ui/Card';

import './DeviceList.css';

export type Device = {
  id: number;
  name: string;
  type: "litterbox" | "feeder" | "fountain";
};

const getDeviceTypeLabel = (type: Device["type"]) => {
  switch (type) {
    case "litterbox":
      return "Litter Box";
    case "feeder":
      return "Feeder";
    case "fountain":
      return "Water Fountain";
    default:
      return type;
  }
};

export default function DeviceList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
  });

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