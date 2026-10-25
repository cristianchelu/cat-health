import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Home, LogOut } from 'lucide-react';
import type { PetPresenceEventDataDTO } from 'shared';
import type { TranslationKey } from '@/lib/translationKey';
import type { EventComponentProps } from './types';
import TimelineEventShell from './TimelineEventShell';

type PresenceState = PetPresenceEventDataDTO['state'];

const PRESENCE_ICON: Record<PresenceState, React.ElementType> = {
  home: Home,
  away: LogOut,
  outside: LogOut,
};

const PRESENCE_COLOR: Record<PresenceState, string> = {
  home: 'var(--color-success)',
  away: 'var(--color-text-muted)',
  outside: 'var(--color-warning)',
};

function presenceTitleKey(presence: PetPresenceEventDataDTO): TranslationKey {
  if (presence.context === 'profile_closed') {
    return 'events.pet_presence_profile_closed';
  }
  if (presence.context === 'profile_reopened') {
    return 'events.pet_presence_profile_reopened';
  }
  return presence.state === 'home'
    ? 'events.pet_presence_home'
    : 'events.pet_presence_away';
}

const PetPresenceEvent: React.FC<EventComponentProps> = (props) => {
  const { t } = useTranslation();
  const presence =
    props.event.data.type === 'pet_presence' ? props.event.data : null;
  if (!presence) {
    return null;
  }

  const Icon = PRESENCE_ICON[presence.state];

  const contextLabel =
    presence.context === 'vet' ||
    presence.context === 'travel' ||
    presence.context === 'friend'
      ? t(`events.pet_presence_context_${presence.context}`)
      : undefined;

  return (
    <TimelineEventShell
      {...props}
      icon={<Icon aria-hidden />}
      iconColor={PRESENCE_COLOR[presence.state]}
      title={t(presenceTitleKey(presence))}
      showDevice={false}
      value={contextLabel}
      valueVariant="default"
    />
  );
};

export default PetPresenceEvent;
