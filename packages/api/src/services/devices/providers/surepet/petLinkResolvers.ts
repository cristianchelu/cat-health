import type { ProviderPetLink } from 'shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getTagIdFromMetadata(metadata: unknown): number | undefined {
  if (!isRecord(metadata)) return undefined;
  const tagId = metadata.tag_id;
  return typeof tagId === 'number' && Number.isFinite(tagId) ? tagId : undefined;
}

export function getLinkTagId(link: ProviderPetLink): number | undefined {
  return getTagIdFromMetadata(link.metadata);
}

export function getLinkRemotePetId(link: ProviderPetLink): number | undefined {
  const id = Number.parseInt(link.external_pet_id, 10);
  return Number.isFinite(id) ? id : undefined;
}
