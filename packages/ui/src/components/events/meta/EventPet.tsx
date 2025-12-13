import * as React from 'react';
import { Cat } from 'lucide-react';
import Timeline from '@/components/ui/Timeline';
import { usePets } from '@/hooks/queries/petQueries';

interface EventPetProps {
  petId: number;
}

const EventPet: React.FC<EventPetProps> = ({ petId }) => {
  const pets = usePets();
  const pet = pets.data?.find((p) => p.id === petId);

  if (!pet) return null;

  return (
    <Timeline.MetaItem>
      <Cat />
      {pet.name}
    </Timeline.MetaItem>
  );
};

export default EventPet;
