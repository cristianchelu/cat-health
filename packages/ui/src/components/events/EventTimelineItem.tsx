import * as React from 'react';
import type { EventComponentProps } from './types';
import LitterboxEvent from './LitterboxEvent';
import WeightEvent from './WeightEvent';
import WaterEvent from './WaterEvent';
import FoodEvent from './FoodEvent';
import GenericEvent from './GenericEvent';

const EventTimelineItem: React.FC<EventComponentProps> = (props) => {
  const { event } = props;
  const type = event.data?.type;

  switch (type) {
    case 'litterbox_use':
      return <LitterboxEvent {...props} />;
    case 'weight_measurement':
      return <WeightEvent {...props} />;
    case 'water_intake':
      return <WaterEvent {...props} />;
    case 'food_intake':
      return <FoodEvent {...props} />;
    default:
      return <GenericEvent {...props} />;
  }
};

export default EventTimelineItem;
