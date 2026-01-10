import { Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { DeviceStatus, DeviceType } from 'shared';

export interface DeviceTable {
  id: Generated<number>;
  provider_account_id: number;
  external_id: string;
  name: string;
  type: DeviceType;
  config: Record<string, unknown> | null;
  enabled: Generated<number>;
  last_seen: number | null;
  status: DeviceStatus | null;
  created_at: Generated<number>;
  updated_at: Generated<number>;
}

export type Device = Selectable<DeviceTable>;
export type NewDevice = Insertable<DeviceTable>;
export type DeviceUpdate = Updateable<DeviceTable>;
