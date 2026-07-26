import { Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface ProviderAccountTable {
  id: Generated<number>;
  provider: string; // 'esphome', 'petkit', 'xiaomi', 'thingino', etc.
  name: string;
  /**
   * User-supplied settings (credentials, hosts, pet links). JSON.
   * Editable from the UI, validated at the API boundary, replaced wholesale
   * on PATCH. Account managers must not write here.
   */
  config: Record<string, unknown>;
  /**
   * Provider-managed runtime state (auth tokens, cached remote ids, sync
   * cursors). JSON. Written only by account managers, never returned to the
   * client and never accepted from it.
   */
  runtime_state: Generated<Record<string, unknown>>;
  enabled: Generated<number>; // boolean
  internal: Generated<number>; // boolean

  created_at: Generated<number>;
  updated_at: Generated<number>;
}

export type ProviderAccount = Selectable<ProviderAccountTable>;
export type NewProviderAccount = Insertable<ProviderAccountTable>;
export type ProviderAccountUpdate = Updateable<ProviderAccountTable>;
