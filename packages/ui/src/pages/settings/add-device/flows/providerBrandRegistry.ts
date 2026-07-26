import type { LucideIcon } from 'lucide-react';
import { Bot, Cpu, Server, Video } from 'lucide-react';
import {
  surepetAccountIdentity,
} from './surepet/surepetAccountConfig.ts';
import {
  inferenceAccountIdentity,
} from './inference/inferenceAccountConfig.ts';

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
  /** Human-facing name. Generic surfaces show this, never the raw provider key. */
  label: string;
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
    monogram: 'S',
    accountIdentity: surepetAccountIdentity,
  },
  inference: {
    label: 'Inference',
    tileColor: '#111827',
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
    return { ...known, monogram: known.monogram ?? deriveMonogram(known.label) };
  }
  const label = provider || 'Unknown';
  return { ...FALLBACK_BRAND, label, monogram: deriveMonogram(label) };
}
