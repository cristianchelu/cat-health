import { type Static, Type } from '@fastify/type-provider-typebox';

/**
 * User-supplied broker settings for an `mqtt` provider account.
 *
 * The account is the broker connection itself: ingest, publishing and the
 * diagnostic-blob path all multiplex over it (summaries/mqtt-integration-plan.md
 * §5.2). Authentication is whatever the broker accepts — anonymous, username
 * and password, or a TLS client certificate — so every credential is optional
 * and only the URL is required. The scheme decides the transport
 * (`mqtt://`, `mqtts://`, `ws://`, `wss://`); the TLS fields apply only to the
 * secure ones.
 */
export const MqttAccountConfigSchema = Type.Object({
  url: Type.String({ minLength: 1 }),
  username: Type.Optional(Type.String()),
  password: Type.Optional(Type.String()),
  /**
   * Fixed client identifier, for brokers that restrict which ids may connect.
   * Left empty, the account manager mints a random one and keeps it in
   * {@link MqttRuntimeStateSchema}.
   */
  client_id: Type.Optional(Type.String()),
  /** PEM. Trusts a private CA instead of the system store. */
  ca_cert: Type.Optional(Type.String()),
  /** PEM pair for certificate-based client authentication. */
  client_cert: Type.Optional(Type.String()),
  client_key: Type.Optional(Type.String()),
  /** Skip server certificate verification (self-signed brokers). */
  allow_untrusted_certs: Type.Optional(Type.Boolean()),
});
export type MqttAccountConfig = Static<typeof MqttAccountConfigSchema>;

/**
 * Provider-managed state. Written only by the account manager, never sent to
 * the client.
 */
export const MqttRuntimeStateSchema = Type.Object({
  /**
   * Client id minted on first connect. Random rather than derived from the
   * account id: two hubs on one broker would otherwise both be
   * `cat-health-1`, and a broker drops the older session when a duplicate id
   * connects.
   */
  client_id: Type.Optional(Type.String()),
});
export type MqttRuntimeState = Static<typeof MqttRuntimeStateSchema>;

export const MQTT_URL_PROTOCOLS = ['mqtt:', 'mqtts:', 'ws:', 'wss:'] as const;
export const MQTT_SECURE_PROTOCOLS = ['mqtts:', 'wss:'] as const;

/**
 * Parse a broker URL the way the connection code will, or return `undefined`.
 * Shared by API validation and the connect form so both agree on what counts
 * as a broker address.
 */
export function parseMqttUrl(value: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (!(MQTT_URL_PROTOCOLS as readonly string[]).includes(url.protocol)) {
    return undefined;
  }
  if (!url.hostname) return undefined;
  return url;
}

export function isSecureMqttUrl(value: string): boolean {
  const url = parseMqttUrl(value);
  return (
    url !== undefined &&
    (MQTT_SECURE_PROTOCOLS as readonly string[]).includes(url.protocol)
  );
}
