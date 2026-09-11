import net from 'node:net';
import mqttPacket, { type IConnectPacket } from 'mqtt-packet';

export interface FakeBrokerOptions {
  /** Returns the CONNACK return code for a CONNECT; 0 accepts. */
  answer: (packet: IConnectPacket) => number;
}

export interface FakeBroker {
  url: string;
  connects: IConnectPacket[];
  close(): Promise<void>;
}

/**
 * Just enough MQTT 3.1.1 to accept or refuse a CONNECT. Every other packet is
 * ignored; the client under test only ever needs the CONNACK.
 */
export async function startFakeBroker(
  options: FakeBrokerOptions,
): Promise<FakeBroker> {
  const connects: IConnectPacket[] = [];
  const sockets = new Set<net.Socket>();

  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    const parser = mqttPacket.parser();
    parser.on('packet', (packet) => {
      if (packet.cmd !== 'connect') return;
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
    });
    socket.on('data', (chunk) => parser.parse(chunk));
    socket.on('error', () => {});
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as net.AddressInfo;

  return {
    url: `mqtt://127.0.0.1:${address.port}`,
    connects,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
