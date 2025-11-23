import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface ProviderAccountTable {
  id: Generated<number>;
  provider: string; // 'esphome', 'petkit', 'xiaomi', 'thingino', etc.
  name: string;
  config: Record<string, unknown>; // JSON
  enabled: Generated<number>; // boolean

  created_at: Generated<number>;
  updated_at: Generated<number>;
}

export type ProviderAccount = Selectable<ProviderAccountTable>;
export type NewProviderAccount = Insertable<ProviderAccountTable>;
export type ProviderAccountUpdate = Updateable<ProviderAccountTable>;
