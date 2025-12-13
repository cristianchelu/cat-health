import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Toilet } from 'lucide-react';
import { usePetContext } from '@/hooks/context/usePetContext';
import { Card, CardHeader } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import Timeline from '@/components/ui/Timeline';
import { WaterEvent, FoodEvent, LitterboxEvent } from '@/components/events';

import WeightTrendCard from '@/pages/overview/components/WeightTrendCard';
import WaterConsumptionCard from '@/pages/overview/components/WaterConsumptionCard';
import FoodIntakeCard from '@/pages/overview/components/FoodIntakeCard';

import './Overview.css';

const Overview: React.FC = () => {
  const { t } = useTranslation();
  const { selectedPet } = usePetContext();

  // Mock date for timeline examples
  const today = '2023-01-01';

  return (
    <div className="page-overview">
      <section className="widget-grid">
        {selectedPet && <WeightTrendCard petId={selectedPet.id} />}
        {selectedPet && <WaterConsumptionCard petId={selectedPet.id} />}
        {selectedPet && <FoodIntakeCard petId={selectedPet.id} />}
        <Card>
          <CardHeader>
            <Toilet style={{ marginRight: 'auto' }} />
            <span>3 {t('overview.times')}</span>
          </CardHeader>
        </Card>
      </section>
      <section>
        <SectionHeader icon={<Clock />}>{t('overview.activity')}</SectionHeader>
        <Timeline>
          <WaterEvent
            event={{
              id: 1,
              timestamp: `${today}T07:45:00`,
              data: { type: 'water_intake', amount: 240, duration: 135000 },
              pet_id: null,
              device_id: null,
              raw_data: null,
              human_verified: false,
            }}
          >
            <Timeline.MetaItem>{t('overview.auto_tracked')}</Timeline.MetaItem>
          </WaterEvent>

          <FoodEvent
            event={{
              id: 2,
              timestamp: `${today}T08:15:00`,
              data: { type: 'food_intake', amount: 150 }, // Note: Showing grams instead of kcal as per component standard
              pet_id: null,
              device_id: null,
              raw_data: null,
              human_verified: false,
            }}
          >
            <Timeline.MetaItem>{t('overview.chicken_pate')}</Timeline.MetaItem>
          </FoodEvent>

          <LitterboxEvent
            event={{
              id: 3,
              timestamp: `${today}T09:05:00`,
              data: {
                type: 'litterbox_use',
                elimination_type: 'defecation',
                duration: 192000,
              },
              pet_id: null,
              device_id: null,
              raw_data: null,
              human_verified: true,
            }}
          />

          <LitterboxEvent
            event={{
              id: 4,
              timestamp: `${today}T14:30:00`,
              data: {
                type: 'litterbox_use',
                elimination_type: 'no_elimination',
                duration: 345000,
              },
              pet_id: null,
              device_id: null,
              raw_data: null,
              human_verified: false,
            }}
          />

          <WaterEvent
            event={{
              id: 5,
              timestamp: `${today}T16:20:00`,
              data: { type: 'water_intake', amount: 85, duration: 45000 },
              pet_id: null,
              device_id: null,
              raw_data: null,
              human_verified: false,
            }}
          />
        </Timeline>
      </section>
    </div>
  );
};

export default Overview;
