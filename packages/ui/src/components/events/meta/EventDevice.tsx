import * as React from 'react';
import { Box } from 'lucide-react';
import Timeline from '@/components/ui/Timeline';
import { useDevices } from '@/hooks/queries/deviceQueries';
import { getDeviceIcon } from '@/components/icons/deviceIcons';

interface EventDeviceProps {
  deviceId: number;
}

const EventDevice: React.FC<EventDeviceProps> = ({ deviceId }) => {
  const { data: devices } = useDevices();
  const device = devices?.find((d) => d.id === deviceId);

  if (!device) return null;

  const icon = getDeviceIcon(device.type, <Box size="1em" />);

  return (
    <Timeline.MetaItem>
      {icon}
      {device.name}
    </Timeline.MetaItem>
  );
};

export default EventDevice;
