import * as React from 'react';
import type { EntityDTO } from 'shared';
import { EntitySensor } from '@/components/devices/entities/EntitySensor';
import { EntityBinarySensor } from '@/components/devices/entities/EntityBinarySensor';
import { EntitySwitch } from '@/components/devices/entities/EntitySwitch';
import { EntityNumber } from '@/components/devices/entities/EntityNumber';
import { EntitySelect } from '@/components/devices/entities/EntitySelect';
import './ESPHomeView.css';

interface ESPHomeViewProps {
  entities: EntityDTO[];
  sensors?: Record<string, unknown>;
}

export const ESPHomeView: React.FC<ESPHomeViewProps> = ({
  entities,
  sensors,
}) => {
  return (
    <div className="esphome-view">
      {entities.map((entity) => {
        const value =
          sensors && entity.id in sensors ? sensors[entity.id] : entity.value;

        switch (entity.type) {
          case 'sensor':
            return (
              <EntitySensor
                key={entity.id}
                label={entity.name}
                value={value as number}
                unit={entity.unit}
              />
            );
          case 'binary_sensor':
            return (
              <EntityBinarySensor
                key={entity.id}
                label={entity.name}
                isOn={Boolean(value)}
                onLabel={entity.onLabel}
                offLabel={entity.offLabel}
              />
            );
          case 'switch':
            return (
              <EntitySwitch
                key={entity.id}
                label={entity.name}
                checked={Boolean(value)}
                onChange={() => {}} // TODO: Implement action
              />
            );
          case 'number':
            return (
              <EntityNumber
                key={entity.id}
                label={entity.name}
                value={value as number}
                min={entity.min}
                max={entity.max}
                step={entity.step}
                unit={entity.unit}
                onChange={() => {}} // TODO: Implement action
              />
            );
          case 'select':
            return (
              <EntitySelect
                key={entity.id}
                label={entity.name}
                value={value as string}
                options={entity.options || []}
                onChange={() => {}} // TODO: Implement action
              />
            );
          default:
            return <pre>{JSON.stringify(entity, null, 2)}</pre>;
        }
      })}
    </div>
  );
};
