import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface DeviceTable {
  id: Generated<number>;
  name: string;
  type: 'litterbox' | 'feeder' | 'water_fountain';
}

export type Device = Selectable<DeviceTable>;
export type NewDevice = Insertable<DeviceTable>;
export type DeviceUpdate = Updateable<DeviceTable>;
