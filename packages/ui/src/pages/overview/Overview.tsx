import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle,
  Clock,
  Drumstick,
  GlassWater,
  Timer,
  Toilet,
} from 'lucide-react';
import { usePetContext } from '@/hooks/context/usePetContext';
import { Card, CardHeader } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import Timeline from './components/Timeline';

import WeightTrendCard from '@/pages/overview/components/WeightTrendCard';

import './Overview.css';

const Overview: React.FC = () => {
  const { t } = useTranslation();
  const { selectedPet } = usePetContext();

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
            <span>3 {t('overview.times')}</span>
          </CardHeader>
        </Card>
      </section>
      <section>
        <SectionHeader icon={<Clock />}>{t('overview.activity')}</SectionHeader>
        <Timeline>
          <Timeline.Item>
            <Timeline.Icon variant="primary">
              <GlassWater />
            </Timeline.Icon>
            <Timeline.Content>
              <Timeline.Header>
                <Timeline.Timestamp>07:45</Timeline.Timestamp>
                <Timeline.Value variant="primary">240 ml</Timeline.Value>
                <Timeline.Title>{t('overview.water_intake')}</Timeline.Title>
              </Timeline.Header>
              <Timeline.Meta>
                <Timeline.MetaItem>
                  <Timer />
                  2m 15s
                </Timeline.MetaItem>
                <Timeline.MetaDivider />
                <Timeline.MetaItem>
                  {t('overview.auto_tracked')}
                </Timeline.MetaItem>
              </Timeline.Meta>
            </Timeline.Content>
          </Timeline.Item>

          <Timeline.Item>
            <Timeline.Icon variant="success">
              <Drumstick />
            </Timeline.Icon>
            <Timeline.Content>
              <Timeline.Header>
                <Timeline.Timestamp>08:15</Timeline.Timestamp>
                <Timeline.Value variant="success">150 kcal</Timeline.Value>
                <Timeline.Title>{t('overview.breakfast')}</Timeline.Title>
              </Timeline.Header>
              <Timeline.Meta>
                <Timeline.MetaItem>
                  {t('overview.chicken_pate')}
                </Timeline.MetaItem>
              </Timeline.Meta>
            </Timeline.Content>
          </Timeline.Item>

          <Timeline.Item>
            <Timeline.Icon variant="warning">
              <Toilet />
            </Timeline.Icon>
            <Timeline.Content>
              <Timeline.Header>
                <Timeline.Timestamp>09:05</Timeline.Timestamp>
                <Timeline.Value variant="warning">
                  {t('overview.defecation')}
                </Timeline.Value>
                <Timeline.Title>{t('overview.litterbox_visit')}</Timeline.Title>
              </Timeline.Header>
              <Timeline.Meta>
                <Timeline.MetaItem>
                  <Timer />
                  3m 12s
                </Timeline.MetaItem>
                <Timeline.MetaDivider />
                <Timeline.MetaItem>
                  <CheckCircle />
                  {t('overview.verified')}
                </Timeline.MetaItem>
              </Timeline.Meta>
            </Timeline.Content>
          </Timeline.Item>

          <Timeline.Item variant="warning">
            <Timeline.Icon variant="danger">
              <Toilet />
            </Timeline.Icon>
            <Timeline.Content>
              <Timeline.Header>
                <Timeline.Timestamp>14:30</Timeline.Timestamp>
                <Timeline.Value variant="danger">
                  {t('overview.no_elimination')}
                </Timeline.Value>
                <Timeline.Title>{t('overview.litterbox_visit')}</Timeline.Title>
              </Timeline.Header>
              <Timeline.Meta>
                <Timeline.MetaItem>
                  <Timer />
                  5m 45s
                </Timeline.MetaItem>
              </Timeline.Meta>
              <Timeline.Footer>
                <Timeline.Badge variant="warning">
                  {t('overview.straining_detected')}
                </Timeline.Badge>
              </Timeline.Footer>
            </Timeline.Content>
          </Timeline.Item>

          <Timeline.Item>
            <Timeline.Icon variant="primary">
              <GlassWater />
            </Timeline.Icon>
            <Timeline.Content>
              <Timeline.Header>
                <Timeline.Timestamp>16:20</Timeline.Timestamp>
                <Timeline.Value variant="primary">85 ml</Timeline.Value>
                <Timeline.Title>{t('overview.water_intake')}</Timeline.Title>
              </Timeline.Header>
              <Timeline.Meta>
                <Timeline.MetaItem>
                  <Timer />
                  45s
                </Timeline.MetaItem>
              </Timeline.Meta>
            </Timeline.Content>
          </Timeline.Item>
        </Timeline>
      </section>
    </div>
  );
};

export default Overview;
