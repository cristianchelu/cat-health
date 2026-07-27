import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import { Bot, Cpu, PawPrint, Server, Video } from 'lucide-react';
import { surepetAccountIdentity } from './surepet/surepetAccountConfig.ts';
import { inferenceAccountIdentity } from './inference/inferenceAccountConfig.ts';

/**
 * Visual identity for a provider, plus the one piece of provider-specific
 * reading that generic surfaces need: a short account-identity line.
 *
 * Deliberately separate from the account-config registry so the providers
 * listing can render a tile without pulling in the wizard's React forms, and so
 * providers with no connect form (esphome, camera, thingino, the seeded
 * `unknown` account) still get a brand entry.
 *
 * Per AGENTS.md, `accountIdentity` implementations live in the provider's own
 * module — this table only references them.
 */
export interface ProviderBrand {
  /**
   * Human-facing name in English. Generic surfaces show this, never the raw
   * provider key — but resolve it through `providerBrandLabel` first.
   */
  label: string;
  /**
   * Set when the label is a common noun rather than a brand name, so it can be
   * translated. Brand names (Sure Petcare, ESPHome, Thingino) have none.
   */
  labelKey?: string;
  /** Tile background. */
  tileColor: string;
  /**
   * Tile foreground. Defaults to white, which only passes contrast on dark
   * enough backgrounds — set explicitly on light or mid-tone tiles.
   */
  tileTextColor?: string;
  Icon?: LucideIcon;
  /** 1–2 characters, used when there is no icon. Derived from `label` if unset. */
  monogram?: string;
  /** Short account identity for list rows, e.g. a login email or API host. */
  accountIdentity?: (config: unknown) => string | undefined;
}

function deriveMonogram(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const PROVIDER_BRANDS: Record<string, ProviderBrand> = {
  surepet: {
    label: 'Sure Petcare',
    tileColor: 'var(--color-primary)',
    // Every other tile carries an icon; a lone letter mark read as unfinished.
    Icon: PawPrint,
    monogram: 'S',
    accountIdentity: surepetAccountIdentity,
  },
  inference: {
    label: 'Inference',
    labelKey: 'settings.provider_label_inference',
    /*
     * Ink, not a fixed near-black: the previous #111827 was the only hardcoded
     * colour here and it sank into the background in dark mode. Paired with the
     * inverted text colour so both themes stay legible.
     */
    tileColor: 'var(--color-text)',
    tileTextColor: 'var(--color-text-inverted)',
    Icon: Bot,
    accountIdentity: inferenceAccountIdentity,
  },
  esphome: {
    label: 'ESPHome',
    tileColor: 'var(--color-secondary)',
    // #12b488 is only ~2.5:1 against white, so use the dark ink instead.
    tileTextColor: 'var(--color-text)',
    Icon: Cpu,
  },
  camera: {
    label: 'Camera',
    labelKey: 'device_types.camera',
    tileColor: 'var(--color-surface-muted)',
    tileTextColor: 'var(--color-text-light)',
    Icon: Video,
  },
  thingino: {
    label: 'Thingino',
    tileColor: 'var(--color-warning)',
    // #f59e0b is ~2.1:1 against white.
    tileTextColor: 'var(--color-text)',
    Icon: Video,
  },
};

const FALLBACK_BRAND: Omit<ProviderBrand, 'label' | 'monogram'> = {
  tileColor: 'var(--color-surface-muted)',
  tileTextColor: 'var(--color-text-light)',
  Icon: Server,
};

/**
 * Always returns a usable brand. Unknown providers — including the seeded
 * `unknown` / "Legacy Devices" account and anything added later — get a neutral
 * tile labelled with the raw provider key rather than throwing.
 */
export function getProviderBrand(provider: string): ProviderBrand {
  const known = PROVIDER_BRANDS[provider];
  if (known) {
    return {
      ...known,
      monogram: known.monogram ?? deriveMonogram(known.label),
    };
  }
  // A missing or literal `unknown` provider has no name to show, so say so in
  // the user's language instead of printing the key.
  const nameless = provider === '' || provider === 'unknown';
  const label = nameless ? 'Unknown' : provider;
  return {
    ...FALLBACK_BRAND,
    label,
    labelKey: nameless ? 'common.unknown' : undefined,
    monogram: deriveMonogram(label),
  };
}

/**
 * Resolve a brand's display label.
 *
 * The registry is a plain module with no hook access, so translatable labels
 * travel as i18n keys and the caller — which already holds `t` — resolves them.
 * `label` doubles as the default value, so a key the locales have not caught up
 * with renders the English word rather than `settings.whatever`.
 */
export function providerBrandLabel(brand: ProviderBrand, t: TFunction): string {
  return brand.labelKey
    ? t(brand.labelKey, { defaultValue: brand.label })
    : brand.label;
}
