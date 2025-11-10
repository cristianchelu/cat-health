import React from 'react';
import { usePet } from '@/contexts/PetContext';
import { Card, CardHeader } from '@/components/ui/Card';
import WeightTrendCard from '@/pages/overview/components/WeightTrendCard';
import { Drumstick, GlassWater, Toilet } from 'lucide-react';

import './Overview.css';

const Overview: React.FC = () => {
  const { selectedPet } = usePet();

  return (
    <div className="page-overview">
      <section className="widget-grid">
        {selectedPet && <WeightTrendCard petId={selectedPet.id} />}
        <Card>
          <CardHeader>
            <GlassWater style={{ marginRight: 'auto' }} />
            <span>240 ml</span>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <Drumstick style={{ marginRight: 'auto' }} />
            <span>150 kcal</span>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <Toilet style={{ marginRight: 'auto' }} />
            <span>3 times</span>
          </CardHeader>
        </Card>
      </section>
    </div>
  );
};

export default Overview;
