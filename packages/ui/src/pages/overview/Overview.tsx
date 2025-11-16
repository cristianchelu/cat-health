import React from 'react';
import { Clock, Drumstick, GlassWater, Toilet } from 'lucide-react';

import { usePet } from '@/contexts/PetContext';
import { Card, CardHeader } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import Timeline from './components/Timeline';

import WeightTrendCard from '@/pages/overview/components/WeightTrendCard';

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
      <section>
        <SectionHeader icon={<Clock />}>Activity</SectionHeader>
        <Timeline>
          <Timeline.Item>
            <Timeline.Icon variant="primary">
              <GlassWater />
            </Timeline.Icon>
            <Timeline.Content>
              <Timeline.Header>
                <Timeline.Title>Water intake</Timeline.Title>
                <Timeline.Timestamp>07:45</Timeline.Timestamp>
              </Timeline.Header>
              <Timeline.Meta>
                <Timeline.Badge variant="primary">240 ml</Timeline.Badge>
                <Timeline.Badge>Auto-tracked</Timeline.Badge>
              </Timeline.Meta>
            </Timeline.Content>
          </Timeline.Item>

          <Timeline.Item>
            <Timeline.Icon variant="success">
              <Drumstick />
            </Timeline.Icon>
            <Timeline.Content>
              <Timeline.Header>
                <Timeline.Title>Breakfast</Timeline.Title>
                <Timeline.Timestamp>08:15</Timeline.Timestamp>
              </Timeline.Header>
              <Timeline.Meta>
                <Timeline.Badge variant="success">150 kcal</Timeline.Badge>
                <Timeline.Badge>Chicken pâté</Timeline.Badge>
              </Timeline.Meta>
            </Timeline.Content>
          </Timeline.Item>

          <Timeline.Item>
            <Timeline.Icon variant="warning">
              <Toilet />
            </Timeline.Icon>
            <Timeline.Content>
              <Timeline.Header>
                <Timeline.Title>Litterbox visit</Timeline.Title>
                <Timeline.Timestamp>09:05</Timeline.Timestamp>
              </Timeline.Header>
              <Timeline.Meta>
                <Timeline.Badge variant="warning">Defecation</Timeline.Badge>
                <Timeline.Badge>3m 12s</Timeline.Badge>
                <Timeline.Badge variant="primary">Verified</Timeline.Badge>
              </Timeline.Meta>
            </Timeline.Content>
          </Timeline.Item>
        </Timeline>
      </section>
    </div>
  );
};

export default Overview;
