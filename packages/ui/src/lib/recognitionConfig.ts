import type {
  DeviceRecognitionConfigDTO,
  DeviceRecognitionLinkDTO,
  ProviderAccountDTO,
  ProviderInfoDTO,
} from 'shared';

export interface RecognitionConfigDraft {
  /** Draft-selected inference account id, or null for no recognition. */
  accountId: number | null;
  /** `''` means "the app's default model", which is what `null` persists as. */
  model: string;
  promptTemplate: string;
  autoIdentify: boolean;
  ignoredPets: number[];
  referenceImages: Record<string, number[]>;
}

export type RecognitionSaveAction =
  | { type: 'none' }
  | { type: 'unlink' }
  | {
      type: 'link';
      accountId: number;
      config: DeviceRecognitionConfigDTO;
    }
  | { type: 'updateConfig'; config: DeviceRecognitionConfigDTO };

export type RecognitionGate = 'needs_camera' | 'no_account' | 'ready';

function numberArraysEqualUnordered(
  a: readonly number[],
  b: readonly number[],
): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((value, index) => value === sortedB[index]);
}

function referenceImagesEqual(
  a: Record<string, number[]>,
  b: Record<string, number[]>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => {
    const idsB = b[key];
    if (idsB === undefined) return false;
    return numberArraysEqualUnordered(a[key] ?? [], idsB);
  });
}

export function recognitionConfigEqual(
  a: RecognitionConfigDraft,
  b: RecognitionConfigDraft,
): boolean {
  if (a.accountId !== b.accountId) return false;
  // Two unlinked drafts are equal no matter what the config fields say:
  // config-only edits while unlinked have nothing to save (see
  // resolveRecognitionSaveAction), so counting them as dirty would enable a
  // Save button that does nothing.
  if (a.accountId === null) return true;
  if (a.model !== b.model) return false;
  if (a.promptTemplate !== b.promptTemplate) return false;
  if (a.autoIdentify !== b.autoIdentify) return false;
  if (!numberArraysEqualUnordered(a.ignoredPets, b.ignoredPets)) return false;
  return referenceImagesEqual(a.referenceImages, b.referenceImages);
}

export function draftFromRecognitionConfig(
  config: DeviceRecognitionConfigDTO | undefined,
): RecognitionConfigDraft {
  const referenceImages: Record<string, number[]> = {};
  for (const [petId, ids] of Object.entries(config?.reference_images ?? {})) {
    referenceImages[petId] = [...ids];
  }
  return {
    accountId: null,
    model: config?.model ?? '',
    // Empty on purpose: scene context is optional, and the form shows the
    // fountain example as a placeholder rather than pre-filled text the user
    // has to recognise as ours and delete.
    promptTemplate: config?.prompt_template ?? '',
    autoIdentify: config?.auto_identify ?? true,
    ignoredPets: [...(config?.ignored_pets ?? [])].sort((a, b) => a - b),
    referenceImages,
  };
}

export function draftFromRecognitionLink(
  link: DeviceRecognitionLinkDTO | null | undefined,
): RecognitionConfigDraft {
  if (!link) return draftFromRecognitionConfig(undefined);
  return {
    ...draftFromRecognitionConfig(link.config),
    accountId: link.account_id,
  };
}

/**
 * The config a draft persists as. An empty model means "the app's default",
 * which the API stores as `null` — pinning the literal default string here
 * would silently freeze a device on today's model.
 *
 * Pets whose reference list was emptied are dropped from `reference_images` so
 * the config never carries `{'1': []}` entries forward, and an emptied
 * denylist is omitted rather than stored as `[]`.
 */
export function buildRecognitionConfig(
  draft: RecognitionConfigDraft,
): DeviceRecognitionConfigDTO {
  const referenceImages: Record<string, number[]> = {};
  for (const [petId, ids] of Object.entries(draft.referenceImages)) {
    if (ids.length > 0) referenceImages[petId] = [...ids];
  }

  const config: DeviceRecognitionConfigDTO = {
    model: draft.model.trim() === '' ? null : draft.model.trim(),
    prompt_template: draft.promptTemplate,
    auto_identify: draft.autoIdentify,
    reference_images: referenceImages,
  };

  if (draft.ignoredPets.length > 0) {
    config.ignored_pets = [...draft.ignoredPets].sort((a, b) => a - b);
  }

  return config;
}

/**
 * Decides which recognition mutation Save should run. Config-only edits while
 * unlinked are a no-op — there is no link row to patch.
 */
export function resolveRecognitionSaveAction(
  baseline: RecognitionConfigDraft,
  draft: RecognitionConfigDraft,
): RecognitionSaveAction {
  if (recognitionConfigEqual(baseline, draft)) return { type: 'none' };

  if (draft.accountId === null) {
    return baseline.accountId === null ? { type: 'none' } : { type: 'unlink' };
  }

  if (draft.accountId !== baseline.accountId) {
    return {
      type: 'link',
      accountId: draft.accountId,
      config: buildRecognitionConfig(draft),
    };
  }

  return { type: 'updateConfig', config: buildRecognitionConfig(draft) };
}

export function isPetWatched(
  ignoredPets: readonly number[] | undefined,
  petId: number,
): boolean {
  return !(ignoredPets ?? []).includes(petId);
}

/**
 * Returns the next `ignored_pets` denylist for a single pet's watch toggle.
 * Omitting an emptied list from persistence is buildRecognitionConfig's job,
 * not this function's.
 */
export function setPetWatched(
  ignoredPets: readonly number[] | undefined,
  petId: number,
  watched: boolean,
): number[] {
  const next = new Set(ignoredPets ?? []);
  if (watched) next.delete(petId);
  else next.add(petId);
  return [...next].sort((a, b) => a - b);
}

/**
 * Appends reference ids for a pet, preserving order while dropping ids the
 * pet already has and duplicates within the incoming batch. Returns the
 * draft untouched when nothing new remains, so no key is materialized for
 * an all-duplicate (or empty) batch.
 */
export function addDraftReferenceImages(
  draft: RecognitionConfigDraft,
  petId: number,
  mediaIds: readonly number[],
): RecognitionConfigDraft {
  const key = String(petId);
  const current = draft.referenceImages[key] ?? [];
  const seen = new Set(current);
  const appended: number[] = [];
  for (const id of mediaIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    appended.push(id);
  }
  if (appended.length === 0) return draft;
  return {
    ...draft,
    referenceImages: {
      ...draft.referenceImages,
      [key]: [...current, ...appended],
    },
  };
}

/**
 * Removes one reference id from a pet's list. A pet with no entry is left
 * untouched — materializing an empty key would make an otherwise unchanged
 * draft compare dirty, since draft equality counts keys.
 */
export function removeDraftReferenceImage(
  draft: RecognitionConfigDraft,
  petId: number,
  mediaId: number,
): RecognitionConfigDraft {
  const key = String(petId);
  const current = draft.referenceImages[key];
  if (current === undefined) return draft;
  return {
    ...draft,
    referenceImages: {
      ...draft.referenceImages,
      [key]: current.filter((id) => id !== mediaId),
    },
  };
}

/**
 * The accounts this device's recognition may be billed to: switched-on
 * accounts whose provider declares it can answer a vision prompt.
 *
 * On the capability, never the provider name (AGENTS.md) — a second inference
 * provider must show up here without this list learning about it.
 */
export function listRecognitionAccounts(
  accounts: readonly ProviderAccountDTO[],
  providers: readonly ProviderInfoDTO[],
): ProviderAccountDTO[] {
  const capable = new Set(
    providers
      .filter((provider) => provider.capabilities.supports_recognition)
      .map((provider) => provider.name),
  );
  return accounts.filter(
    (account) => account.enabled && capable.has(account.provider),
  );
}

/**
 * A camera link is the hard gate: without a source there is nothing to
 * recognize. `no_account` then means there is no recognition-capable account
 * to bill a call to, which is a trip to Providers rather than anything this
 * tab can fix.
 */
export function resolveRecognitionGate(args: {
  hasCameraLink: boolean;
  accountCount: number;
}): RecognitionGate {
  if (!args.hasCameraLink) return 'needs_camera';
  if (args.accountCount === 0) return 'no_account';
  return 'ready';
}
