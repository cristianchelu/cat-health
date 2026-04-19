/**
 * TODO: We load the full foods catalog via useFoods() and resolve by id. That is fine
 * while the catalog stays small (expected under ~50 items). If the API grows large
 * (pagination, hundreds of rows), revisit: e.g. useFood(foodId), request batching, or
 * server-side embedding on event payloads.
 */
import * as React from 'react';
import { Package } from 'lucide-react';
import Timeline from '@/components/ui/Timeline';
import { useFoods } from '@/hooks/queries/foodQueries';

interface EventFoodProps {
  foodId: number;
}

function foodDisplayLabel(brand: string | null, name: string): string {
  const b = brand?.trim();
  return b ? `${b} ${name}` : name;
}

const EventFood: React.FC<EventFoodProps> = ({ foodId }) => {
  const { data: foods } = useFoods();
  const food = foods?.find((f) => f.id === foodId);

  if (!food) return null;

  return (
    <Timeline.MetaItem>
      <Package aria-hidden />
      {foodDisplayLabel(food.brand, food.name)}
    </Timeline.MetaItem>
  );
};

export default EventFood;
