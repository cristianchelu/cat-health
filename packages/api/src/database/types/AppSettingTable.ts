import type { Selectable, Updateable } from 'kysely';

export interface AppSettingTable {
  key: string;
  value: string;
}

export type AppSetting = Selectable<AppSettingTable>;
export type AppSettingUpdate = Updateable<AppSettingTable>;
