import { EventEmitter } from 'events';

export interface DeviceEvent {
  deviceId: number;
  type: string;
  data: unknown;
  timestamp: Date;
}

export class EventBus extends EventEmitter {
  publish(topic: string, event: unknown) {
    this.emit(topic, event);
  }

  subscribe<T = unknown>(topic: string, handler: (event: T) => void) {
    this.on(topic, handler);
  }
}
