import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * Polymorphic association between a media asset and any domain entity.
 * entity_type + entity_id identify the owning record (e.g. pet, device, event).
 * relation provides a semantic role (e.g. 'avatar', 'thumbnail', 'raw').
 */
export interface MediaLinkTable {
  id: Generated<number>;
  media_id: number; // FK -> media.id (enforced in migration)
  entity_type: string; // e.g. 'pet', 'device', 'event'
  entity_id: string; // stored as string to allow heterogeneous PK types
  relation: string | null; // optional semantic role
  created_at: number; // unix epoch seconds
}

export type MediaLink = Selectable<MediaLinkTable>;
export type NewMediaLink = Insertable<MediaLinkTable>;
export type MediaLinkUpdate = Updateable<MediaLinkTable>;
