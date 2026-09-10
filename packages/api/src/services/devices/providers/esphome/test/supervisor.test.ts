import assert from 'node:assert/strict';
import { createServer, type Server, type Socket } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, it } from 'node:test';
import {
  encodeProtoFields,
  encodeVarint,
  MessageType,
  readVarint,
  WireType,
} from 'esphome-client';

import { BaseESPHomeController } from '../BaseESPHomeController.ts';
import type { Device, ProviderDeps } from '../../../types.ts';

/**
 * A plaintext ESPHome device on a loopback port: answers the handshake, lists
 * one sensor, publishes its state, and answers pings. Its sockets can be
 * dropped at will, which is what a rebooting device looks like from here.
 */
class FakeDevice {
  readonly sockets = new Set<Socket>();
  connections = 0;
  private server: Server | null = null;

  private readonly options: { helloMajor?: number };

  constructor(options: { helloMajor?: number } = {}) {
    this.options = options;
  }

  static async listen(
    port = 0,
    options: { helloMajor?: number } = {},
  ): Promise<FakeDevice> {
    const device = new FakeDevice(options);
    await device.start(port);
    return device;
  }

  get port(): number {
    const address = this.server?.address();
    if (
      address === null ||
      address === undefined ||
      typeof address === 'string'
    ) {
      throw new Error('fake device is not listening');
    }
    return address.port;
  }

  private start(port: number): Promise<void> {
    this.server = createServer((socket) => this.serve(socket));
    return new Promise((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, '127.0.0.1', () => resolve());
    });
  }

  /** Kill every live session without closing the listener. */
  dropAll(): void {
    for (const socket of this.sockets) {
      socket.destroy();
    }
  }

  async close(): Promise<void> {
    this.dropAll();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    this.server = null;
  }

  private serve(socket: Socket): void {
    this.connections++;
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => {});

    let pending = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      for (;;) {
        const frame = this.readFrame(pending);
        if (frame === null) return;
        pending = pending.subarray(frame.consumed);
        this.handle(socket, frame.type);
      }
    });
  }

  private readFrame(buffer: Buffer): { type: number; consumed: number } | null {
    if (buffer.length < 3) return null;
    assert.equal(buffer[0], 0x00, 'client must speak plaintext to the fake');
    try {
      const [length, lengthBytes] = readVarint(buffer, 1);
      const [type, typeBytes] = readVarint(buffer, 1 + lengthBytes);
      const consumed = 1 + lengthBytes + typeBytes + length;
      return buffer.length < consumed ? null : { type, consumed };
    } catch {
      return null;
    }
  }

  private send(
    socket: Socket,
    type: number,
    payload: Buffer = Buffer.alloc(0),
  ): void {
    if (socket.destroyed) return;
    socket.write(
      Buffer.concat([
        Buffer.from([0x00]),
        encodeVarint(payload.length),
        encodeVarint(type),
        payload,
      ]),
    );
  }

  private handle(socket: Socket, type: number): void {
    const str = (fieldNumber: number, value: string) => ({
      fieldNumber,
      value: Buffer.from(value, 'utf8'),
      wireType: WireType.LENGTH_DELIMITED,
    });
    const int = (fieldNumber: number, value: number) => ({
      fieldNumber,
      value,
      wireType: WireType.VARINT,
    });
    switch (type) {
      case MessageType.HELLO_REQUEST:
        this.send(
          socket,
          MessageType.HELLO_RESPONSE,
          encodeProtoFields([
            int(1, this.options.helloMajor ?? 1),
            int(2, 14),
            str(3, 'fake 2025.10.0'),
            str(4, 'fake'),
          ]),
        );
        break;
      case MessageType.CONNECT_REQUEST:
        this.send(socket, MessageType.CONNECT_RESPONSE);
        break;
      case MessageType.DEVICE_INFO_REQUEST:
        this.send(
          socket,
          MessageType.DEVICE_INFO_RESPONSE,
          encodeProtoFields([
            str(2, 'fake'),
            str(3, 'AA:BB:CC:DD:EE:FF'),
            str(4, '2025.10.0'),
          ]),
        );
        break;
      case MessageType.LIST_ENTITIES_REQUEST:
        this.send(
          socket,
          MessageType.LIST_ENTITIES_SENSOR_RESPONSE,
          encodeProtoFields([
            str(1, 'water_level'),
            { fieldNumber: 2, value: 1, wireType: WireType.FIXED32 },
            str(3, 'Water Level'),
          ]),
        );
        this.send(socket, MessageType.LIST_ENTITIES_DONE_RESPONSE);
        break;
      case MessageType.SUBSCRIBE_STATES_REQUEST: {
        const state = Buffer.alloc(4);
        state.writeFloatLE(42, 0);
        this.send(
          socket,
          MessageType.SENSOR_STATE_RESPONSE,
          encodeProtoFields([
            { fieldNumber: 1, value: 1, wireType: WireType.FIXED32 },
            { fieldNumber: 2, value: state, wireType: WireType.FIXED32 },
          ]),
        );
        break;
      }
      case MessageType.PING_REQUEST:
        this.send(socket, MessageType.PING_RESPONSE);
        break;
      case MessageType.DISCONNECT_REQUEST:
        this.send(socket, MessageType.DISCONNECT_RESPONSE);
        socket.end();
        break;
      default:
        break;
    }
  }
}

/** Grab a free loopback port and release it, so a test can start closed. */
async function reservePort(): Promise<number> {
  const device = await FakeDevice.listen();
  const port = device.port;
  await device.close();
  return port;
}

class TestController extends BaseESPHomeController {
  readonly presenceLog: string[] = [];
  readonly readings: unknown[] = [];

  constructor(port: number) {
    const device = {
      id: 1,
      name: 'Fake',
      type: 'water_fountain',
      config: { host: '127.0.0.1', port },
    } as unknown as Device;
    const presenceLog: string[] = [];
    const deps = {
      presence: {
        reportOnline: () => presenceLog.push('online'),
        reportOffline: () => presenceLog.push('offline'),
        recordActivity: () => {},
      },
    } as unknown as ProviderDeps;
    super(device, deps, {
      initialDelayMs: 25,
      maxDelayMs: 100,
      pingIntervalMs: 300,
      stallTimeoutMs: 1000,
      connectTimeoutMs: 2000,
    });
    this.presenceLog = presenceLog;
  }

  protected get deviceTypeName(): string {
    return 'fake';
  }
  protected onConnected(): void {}
  protected onEntitiesReceived(): void {}
  protected handleSensorUpdate(_key: number, state: unknown): void {
    this.readings.push(state);
  }
}

async function until(
  what: string,
  check: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await sleep(10);
  }
}

describe('ESPHome connection supervision', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()!();
    }
  });

  it('reconnects on its own after a live session drops', async () => {
    const device = await FakeDevice.listen();
    cleanups.push(() => device.close());
    const controller = new TestController(device.port);
    cleanups.push(() => controller.disconnect());

    await controller.connect();
    assert.equal(controller.getStatus(), 'online');
    await until('first reading', () => controller.readings.includes(42));

    device.dropAll();
    await until('offline', () => controller.getStatus() === 'offline');
    await until('back online', () => controller.getStatus() === 'online');

    assert.equal(device.connections, 2, 'one reconnect, driven by the library');
    assert.deepEqual(controller.presenceLog.slice(-3), [
      'online',
      'offline',
      'online',
    ]);
  });

  it('keeps retrying a device that is down when the server starts', async () => {
    const port = await reservePort();
    const controller = new TestController(port);
    cleanups.push(() => controller.disconnect());

    const connected = controller.connect();
    // Long enough for several attempts at 25ms, 50ms, 100ms.
    await sleep(250);
    assert.equal(controller.getStatus(), 'offline');

    const device = await FakeDevice.listen(port);
    cleanups.push(() => device.close());
    await connected;

    assert.equal(controller.getStatus(), 'online');
    assert.equal(device.connections, 1);
  });

  it('stops when the device rejects the API version for good', async () => {
    const device = await FakeDevice.listen(0, { helloMajor: 99 });
    cleanups.push(() => device.close());
    const controller = new TestController(device.port);
    cleanups.push(() => controller.disconnect());

    await controller.connect();
    await sleep(400);

    assert.equal(controller.getStatus(), 'offline');
    assert.equal(device.connections, 1, 'no retry on a permanent error');
  });

  it('disconnect() halts the first-connect loop', async () => {
    const port = await reservePort();
    const controller = new TestController(port);

    const connected = controller.connect();
    await sleep(60);
    await controller.disconnect();
    await connected;

    const device = await FakeDevice.listen(port);
    cleanups.push(() => device.close());
    await sleep(300);

    assert.equal(device.connections, 0);
    assert.equal(controller.getStatus(), 'offline');
  });
});
