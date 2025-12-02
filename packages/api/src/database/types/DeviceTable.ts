import { Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { DeviceStatus, DeviceType } from 'shared';

export interface DeviceTable {
  id: Generated<number>;
  provider_account_id: number;
  external_id: string;
  name: string;
  type: DeviceType;
  config: Record<string, unknown> | null; // JSON string or object depending on how Kysely handles jsonb. Usually string or object if using a plugin.
  // Kysely's ParseJSONResultsPlugin is often used. Assuming it is used or we handle it.
  // In the migration I used 'jsonb'.
  // Let's check other tables. MediaTable uses 'jsonb'.

  enabled: Generated<number>; // boolean stored as 0/1 in sqlite usually, but Kysely might map it.
  // In migration: .addColumn('enabled', 'boolean', ...)
  // Kysely maps boolean to number (0/1) in SQLite by default unless using a plugin.
  // Let's check PetTable or others.

  last_seen: number | null; // timestamp
  status: DeviceStatus | null;

  created_at: Generated<number>;
  updated_at: Generated<number>;
}

export type Device = Selectable<DeviceTable>;
export type NewDevice = Insertable<DeviceTable>;
export type DeviceUpdate = Updateable<DeviceTable>;
