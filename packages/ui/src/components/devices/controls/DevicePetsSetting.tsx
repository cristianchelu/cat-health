import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Tag } from 'lucide-react';
import type { ControlValueType, SettingControl } from 'shared';
import { Button } from '@/components/ui/Button';
import { usePets } from '@/hooks/queries/petQueries';
import { identitiesDraft } from '@/lib/deviceControlDraft';
import {
  PetToggleGrid,
  type PetToggleHelp,
  type PetToggleTile,
} from './PetToggleGrid';

type IdentitiesType = Extract<ControlValueType, { kind: 'identities' }>;

interface DevicePetsSettingProps {
  setting: SettingControl & { type: IdentitiesType };
  /** The drafted identity ids. */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Where identities and pets get linked to each other. */
  accountId?: number;
}

/**
 * Edits an identities setting in a draft. Every identity the provider knows
 * gets a switch, drawn as the app pet it is linked to or under the
 * provider's own name; app pets no identity is linked to follow, locked.
 * Whatever is unlinked explains itself behind a help glyph, with the way
 * to the account page.
 */
const DevicePetsSetting: React.FC<DevicePetsSettingProps> = ({
  setting,
  value,
  onChange,
  disabled,
  accountId,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: pets = [] } = usePets();
  const on = new Set(value);
  const petsById = new Map(pets.map((pet) => [pet.id, pet]));

  const help = (name: string, body: string): PetToggleHelp => ({
    label: t('devices.controls.pets_help_aria', { name }),
    body,
    action:
      accountId === undefined ? undefined : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/settings/providers/${accountId}`)}
        >
          {t('devices.controls.pets_link_account')}
        </Button>
      ),
  });

  const linked: PetToggleTile[] = [];
  const unnamed: PetToggleTile[] = [];
  for (const option of setting.type.options) {
    const pet = option.pet_id == null ? undefined : petsById.get(option.pet_id);
    const name = pet?.name ?? option.label;
    const tile: PetToggleTile = {
      id: option.id,
      name,
      subtitle: pet && pet.name !== option.label ? option.label : undefined,
      avatarUrl: pet?.avatar_url,
      icon: pet ? undefined : <Tag aria-hidden="true" />,
      on: on.has(option.id),
      eligible: true,
      switchAriaLabel: t('devices.controls.pets_toggle_aria', { name }),
      help: pet
        ? undefined
        : help(name, t('devices.controls.pets_identity_unlinked')),
    };
    (pet ? linked : unnamed).push(tile);
  }
  const represented = new Set(
    setting.type.options.map((option) => option.pet_id),
  );
  const unseen = pets
    .filter((pet) => !represented.has(pet.id))
    .map(
      (pet): PetToggleTile => ({
        id: `pet:${pet.id}`,
        name: pet.name,
        avatarUrl: pet.avatar_url,
        on: false,
        eligible: false,
        switchAriaLabel: t('devices.controls.pets_toggle_aria', {
          name: pet.name,
        }),
        help: help(
          pet.name,
          t('devices.controls.pets_not_linked', { name: pet.name }),
        ),
      }),
    );

  return (
    <PetToggleGrid
      pets={[...linked, ...unnamed, ...unseen]}
      emptyLabel={t('devices.controls.pets_empty')}
      onToggle={(id, next) =>
        onChange(
          next
            ? identitiesDraft([...value, id])
            : value.filter((current) => current !== id),
        )
      }
      disabled={disabled}
    />
  );
};

export { DevicePetsSetting, type DevicePetsSettingProps };
