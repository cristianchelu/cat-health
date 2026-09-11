import { randomBytes } from 'node:crypto';
import mqtt, {
  type IClientOptions,
  type MqttClient,
  ErrorWithReasonCode,
  ReasonCodes,
} from 'mqtt';
import {
  isSecureMqttUrl,
  isValidMqttTopicPrefix,
  MQTT_DEFAULT_TOPIC_PREFIX,
  MqttAccountConfigSchema,
  parseMqttUrl,
  parseWithSchema,
  type MqttAccountConfig,
} from 'shared';

/** Upper bound on one connection attempt, TCP/TLS handshake and CONNACK included. */
export const MQTT_CONNECT_TIMEOUT_MS = 10_000;

/**
 * Account config as the manager trusts it, or `undefined`. Stricter than the
 * schema alone: the URL must be one the client can actually dial, and a
 * topic prefix, when given, must be one it may subscribe to.
 */
export function parseMqttAccountConfig(
  config: unknown,
): MqttAccountConfig | undefined {
  const parsed = parseWithSchema(MqttAccountConfigSchema, config);
  if (!parsed || !parseMqttUrl(parsed.url)) return undefined;
  if (
    parsed.topic_prefix !== undefined &&
    !isValidMqttTopicPrefix(parsed.topic_prefix)
  ) {
    return undefined;
  }
  return parsed;
}

export function topicPrefixOf(config: MqttAccountConfig): string {
  return config.topic_prefix ?? MQTT_DEFAULT_TOPIC_PREFIX;
}

/**
 * MQTT 3.1.1 only obliges a broker to accept ids up to 23 characters; both
 * shapes here stay under that.
 */
export function mintMqttClientId(prefix: 'cat-health' | 'cat-health-probe') {
  return `${prefix}-${randomBytes(3).toString('hex')}`;
}

/**
 * Translate account config into MQTT.js options. The caller picks the client
 * id: which one is right depends on whether this is the account's own session
 * or a probe beside it. Empty strings are the form's way of saying "unset", so
 * they are dropped rather than sent: an empty username would otherwise be
 * presented to the broker as a real credential, and an empty PEM would fail
 * TLS setup with an unhelpful parse error.
 */
export function buildMqttClientOptions(
  config: MqttAccountConfig,
  clientId: string,
  overrides: IClientOptions = {},
): IClientOptions {
  const options: IClientOptions = {
    clientId,
    connectTimeout: MQTT_CONNECT_TIMEOUT_MS,
    ...overrides,
  };
  if (config.username) options.username = config.username;
  if (config.password) options.password = config.password;

  if (isSecureMqttUrl(config.url)) {
    if (config.ca_cert) options.ca = config.ca_cert;
    if (config.client_cert) options.cert = config.client_cert;
    if (config.client_key) options.key = config.client_key;
    if (config.allow_untrusted_certs) options.rejectUnauthorized = false;
  }
  return options;
}

/**
 * The connection outcome as a sentence the connect form can show. MQTT.js
 * surfaces a refused CONNECT as `ErrorWithReasonCode` and everything below it
 * (DNS, TCP, TLS) as a Node system error, whose codes read as jargon.
 */
export function describeMqttConnectError(error: unknown): string {
  if (error instanceof ErrorWithReasonCode) {
    const reason =
      (ReasonCodes as Record<number, string>)[error.code] ??
      `code ${error.code}`;
    return `Broker refused the connection: ${reason}`;
  }
  if (!(error instanceof Error)) return String(error);
  const code = (error as NodeJS.ErrnoException).code;
  switch (code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'Broker host not found';
    case 'ECONNREFUSED':
      return 'Broker is not accepting connections on that port';
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
      return 'Broker did not respond';
    case 'ECONNRESET':
      return 'Broker closed the connection during handshake';
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'SELF_SIGNED_CERT_IN_CHAIN':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'CERT_HAS_EXPIRED':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return `Broker certificate is not trusted (${code})`;
    default:
      return error.message;
  }
}

/**
 * Connect once and hang up. Resolves when the broker acknowledges the CONNECT
 * with this config, rejects with a user-facing reason otherwise. No reconnect:
 * the point is to hear the first answer, not to keep trying.
 *
 * Always under its own client id, never the account's. A config edit is
 * probed while the account's live session is still up, and a broker evicts
 * the older session when a duplicate id connects, so probing under the real
 * id would knock the account offline to check whether it could come back.
 * A broker that restricts client ids can therefore pass the probe and still
 * refuse the live session; the manager logs that refusal.
 */
export async function probeMqttBroker(
  config: MqttAccountConfig,
): Promise<void> {
  const client = mqtt.connect(
    config.url,
    buildMqttClientOptions(config, mintMqttClientId('cat-health-probe'), {
      reconnectPeriod: 0,
    }),
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Broker did not respond'));
      }, MQTT_CONNECT_TIMEOUT_MS + 1_000);
      const done = (outcome: () => void) => {
        clearTimeout(timer);
        outcome();
      };
      client.once('connect', () => done(resolve));
      client.once('error', (error) =>
        done(() => reject(new Error(describeMqttConnectError(error)))),
      );
      // With reconnects off, a close that no error preceded is the socket
      // ending before CONNACK — the broker dropped us without a reason.
      client.once('close', () =>
        done(() =>
          reject(new Error('Broker closed the connection before answering')),
        ),
      );
    });
  } finally {
    await endClient(client);
  }
}

/** `end(true)` so an in-flight connect is dropped rather than waited on. */
export function endClient(client: MqttClient): Promise<void> {
  return new Promise((resolve) => client.end(true, {}, () => resolve()));
}
