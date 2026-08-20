import type {
  GetPetResponseDTO,
  ProviderPetLink,
  ProviderRemotePet,
} from 'shared';
import { isRecord } from '@/lib/utils';

export function normalizePetName(name: string): string {
  return name.trim().toLowerCase();
}

export function getTagIdFromRemotePet(
  pet: ProviderRemotePet,
): number | undefined {
  if (!isRecord(pet.metadata)) return undefined;
  const tagId = pet.metadata.tag_id;
  return typeof tagId === 'number' && Number.isFinite(tagId)
    ? tagId
    : undefined;
}

export function buildPetLinksFromCloud(
  cloudPets: ProviderRemotePet[],
  localPets: GetPetResponseDTO[],
  existingLinks: ProviderPetLink[] = [],
): ProviderPetLink[] {
  const existingByExternalId = new Map(
    existingLinks.map((link) => [link.external_pet_id, link]),
  );

  return cloudPets.map((cloudPet) => {
    const prior = existingByExternalId.get(cloudPet.external_id);
    const tagId = getTagIdFromRemotePet(cloudPet);

    if (prior) {
      return {
        ...prior,
        remote_name: cloudPet.name ?? prior.remote_name,
        ...(tagId != null
          ? {
              metadata: {
                ...(isRecord(prior.metadata) ? prior.metadata : {}),
                tag_id: tagId,
              },
            }
          : {}),
      };
    }

    const cloudName = cloudPet.name?.trim() ?? '';
    const match = localPets.find(
      (local) =>
        normalizePetName(local.name) === normalizePetName(cloudName) &&
        cloudName.length > 0,
    );

    return {
      external_pet_id: cloudPet.external_id,
      remote_name: cloudPet.name ?? undefined,
      ...(tagId != null ? { metadata: { tag_id: tagId } } : {}),
      pet_id: match?.id ?? 0,
    };
  });
}

export function petLinksForSave(links: ProviderPetLink[]): ProviderPetLink[] {
  return links
    .filter((link) => link.pet_id > 0)
    .map((link) => ({
      external_pet_id: link.external_pet_id,
      pet_id: link.pet_id,
      ...(link.remote_name ? { remote_name: link.remote_name } : {}),
      ...(link.metadata !== undefined ? { metadata: link.metadata } : {}),
    }));
}

export function getTagIdFromLink(link: ProviderPetLink): number | undefined {
  return getTagIdFromRemotePet({
    external_id: link.external_pet_id,
    metadata: link.metadata,
  });
}
