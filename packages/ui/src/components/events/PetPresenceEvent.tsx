import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Home, LogOut } from 'lucide-react';
import type { PetPresenceEventDataDTO } from 'shared';
import type { EventComponentProps } from './types';
import TimelineEventShell from './TimelineEventShell';
import './PetPresenceEvent.css';

type PresenceState = PetPresenceEventDataDTO['state'];

const PRESENCE_ICON: Record<PresenceState, React.ElementType> = {
  home: Home,
  away: LogOut,
  outside: LogOut,
};

const PRESENCE_VARIANT: Record<
  PresenceState,
  'success' | 'default' | 'warning'
> = {
  home: 'success',
  away: 'default',
  outside: 'warning',
};

const PetPresenceEvent: React.FC<EventComponentProps> = (props) => {
  const { t } = useTranslation();
  const presence =
    props.event.data.type === 'pet_presence' ? props.event.data : null;
  if (!presence) {
    return null;
  }

  const Icon = PRESENCE_ICON[presence.state];
  const titleKey =
    presence.state === 'home'
      ? 'events.pet_presence_home'
      : 'events.pet_presence_away';

  const contextLabel =
    presence.context && presence.context !== 'manual'
      ? t(`events.pet_presence_context_${presence.context}`)
      : undefined;

  return (
    <TimelineEventShell
      {...props}
      className="pet-presence-event"
      icon={<Icon aria-hidden />}
      iconVariant={PRESENCE_VARIANT[presence.state]}
      title={t(titleKey)}
      showDevice={false}
      value={contextLabel}
      valueVariant="default"
    />
  );
};

export default PetPresenceEvent;
