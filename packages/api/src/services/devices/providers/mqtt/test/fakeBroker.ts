import net from 'node:net';
import mqttPacket, {
  type IConnectPacket,
  type ISubscribePacket,
} from 'mqtt-packet';

export interface FakeBrokerOptions {
  /** Returns the CONNACK return code for a CONNECT; 0 accepts. */
  answer: (packet: IConnectPacket) => number;
}

export interface FakeBroker {
  url: string;
  connects: IConnectPacket[];
  /** Topic filters from every SUBSCRIBE, in arrival order. */
  subscriptions: string[];
  /** Deliver a message to every connected client, subscribed or not. */
  publish(topic: string, payload: string | Buffer, retain?: boolean): void;
  close(): Promise<void>;
}

/**
 * Just enough MQTT 3.1.1 to accept or refuse a CONNECT, acknowledge a
 * SUBSCRIBE and push a PUBLISH. It does no topic matching: the client under
 * test hears whatever `publish` sends.
 */
export async function startFakeBroker(
  options: FakeBrokerOptions,
): Promise<FakeBroker> {
  const connects: IConnectPacket[] = [];
  const subscriptions: string[] = [];
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const parser = mqttPacket.parser();
    parser.on('packet', (packet) => {
      if (packet.cmd === 'connect') {
        connects.push(packet);
        const returnCode = options.answer(packet);
        socket.write(
          mqttPacket.generate({
            cmd: 'connack',
            returnCode,
            sessionPresent: false,
          }),
        );
        if (returnCode !== 0) socket.end();
      } else if (packet.cmd === 'subscribe') {
        const subscribe = packet as ISubscribePacket;
        for (const sub of subscribe.subscriptions)
          subscriptions.push(sub.topic);
        socket.write(
          mqttPacket.generate({
            cmd: 'suback',
            messageId: subscribe.messageId,
            granted: subscribe.subscriptions.map((sub) => sub.qos),
          }),
        );
      } else if (packet.cmd === 'pingreq') {
        socket.write(mqttPacket.generate({ cmd: 'pingresp' }));
      }
    });
    socket.on('data', (chunk) => parser.parse(chunk));
    socket.on('error', () => {});
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as net.AddressInfo;

  return {
    url: `mqtt://127.0.0.1:${address.port}`,
    connects,
    subscriptions,
    publish: (topic, payload, retain = false) => {
      const packet = mqttPacket.generate({
        cmd: 'publish',
        topic,
        payload: typeof payload === 'string' ? Buffer.from(payload) : payload,
        qos: 0,
        retain,
        dup: false,
      });
      for (const socket of sockets) socket.write(packet);
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
