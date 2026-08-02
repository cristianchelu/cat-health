import * as React from 'react';
import { Cat, Bot, User, PawPrint, CloudDrizzle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Timeline from '@/components/ui/Timeline';
import { usePets } from '@/hooks/queries/petQueries';
import { causeLabelKey } from '@/lib/eventAttribution';
import type { EventCauseDTO } from 'shared';

interface EventPetProps {
  petId: number | null;
  causedBy: EventCauseDTO;
}

const CAUSE_ICONS: Record<Exclude<EventCauseDTO, 'unknown' | 'pet'>, LucideIcon> =
  {
    robot_vacuum: Bot,
    human: User,
    other_animal: PawPrint,
    environment: CloudDrizzle,
  };

/**
 * The attribution chip.
 *
 * An unresolved event renders nothing — it is one of many on the timeline, and
 * the blank is what "nobody has looked at this yet" looks like. Every settled
 * cause gets a chip, including the non-pet ones: that is the whole point of
 * naming them, and it is how you tell a decision apart from a blank.
 */
const EventPet: React.FC<EventPetProps> = ({ petId, causedBy }) => {
  const { t } = useTranslation();
  const pets = usePets();

  if (causedBy === 'unknown') return null;

  if (causedBy !== 'pet') {
    const Icon = CAUSE_ICONS[causedBy];
    return (
      <Timeline.MetaItem>
        <Icon />
        {t(causeLabelKey(causedBy))}
      </Timeline.MetaItem>
    );
  }

  const pet = petId != null ? pets.data?.find((p) => p.id === petId) : undefined;

  return (
    <Timeline.MetaItem>
      <Cat />
      {/* `pet` with no id: we know an animal, not which one. */}
      {pet?.name ?? t(causeLabelKey('pet'))}
    </Timeline.MetaItem>
  );
};

export default EventPet;
