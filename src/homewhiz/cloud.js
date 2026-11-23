// -----------------------------------------------------------------------------
// HomeWhiz cloud real-time channel: the AWS IoT Core MQTT broker the HomeWhiz
// app talks to, over a SigV4 pre-signed WebSocket.
//
//   - every appliance is an AWS IoT "thing": its state arrives on
//     `$aws/things/<id>/shadow/update/accepted` (and `get/accepted` after a
//     read request), as a byte array (`wfa`, see controls.js);
//   - a "force read" asks the appliance to report its state now;
//   - a command is an `[index, value]` write published on `<id>/command`.
//
// The temporary AWS credentials of the login expire (about an hour): the
// client signs in again a few minutes before, and the WebSocket URL is
// re-signed on every (re)connection.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import mqtt from 'mqtt';
import { createLogger } from '@gladysassistant/integration-sdk';
import { LoginError, login as defaultLogin } from './api.js';
import { presignIotWebsocketUrl } from './sigv4.js';
import { shadowPayloadToData } from './controls.js';

const logger = createLogger({ name: 'homewhiz-cloud' });

export const IOT_ENDPOINT = 'ajf7v9dcoe69w-ats.iot.eu-west-1.amazonaws.com';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const MIN_REFRESH_DELAY_MS = 60 * 1000;
const DEFAULT_CREDENTIALS_LIFETIME_MS = 55 * 60 * 1000;
// Let the appliance apply a command before the next one / the read-back.
const COMMAND_SPACING_MS = 500;

const SHADOW_TOPIC = /^\$aws\/things\/([^/]+)\/shadow\/(update|get)\/accepted$/;

const isTuya = (applianceId) => applianceId.startsWith('T');
const commandSuffix = (applianceId) => (isTuya(applianceId) ? 'tuyacommand' : 'command');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Events: `connected`, `disconnected`, `data` (applianceId, Uint8Array),
 * `online` (applianceId, boolean), `error` (Error), `auth-failed` (the
 * account refused the credentials: no retry).
 */
export class HomeWhizCloud extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.username - HomeWhiz account e-mail.
   * @param {string} options.password - HomeWhiz account password.
   * @param {Function} [options.login] - Injected for the tests.
   * @param {Function} [options.connectMqtt] - Injected for the tests (`mqtt.connect`).
   * @param {number} [options.commandSpacingMs]
   */
  constructor({
    username,
    password,
    login = defaultLogin,
    connectMqtt = mqtt.connect,
    commandSpacingMs = COMMAND_SPACING_MS,
  }) {
    super();
    this.username = username;
    this.password = password;
    this.login = login;
    this.connectMqtt = connectMqtt;
    this.commandSpacingMs = commandSpacingMs;
    this.applianceIds = [];
    this.credentials = null;
    this.client = null;
    this.connected = false;
    this.refreshTimer = null;
    this.stopped = false;
  }

  /** Sign in and connect to the broker for the given appliances. */
  async start(applianceIds, credentials = null) {
    this.stopped = false;
    this.applianceIds = [...applianceIds];
    this.credentials = credentials ?? (await this.login(this.username, this.password));
    this.scheduleRefresh();
    this.openClient();
  }

  openClient() {
    const client = this.connectMqtt(this.signedUrl(), {
      clientId: randomUUID().replaceAll('-', ''),
      protocolVersion: 4,
      clean: true,
      keepalive: 300,
      reconnectPeriod: 15_000,
      connectTimeout: 30_000,
      // Re-sign on every reconnection: a signature is valid 15 minutes.
      transformWsUrl: () => this.signedUrl(),
    });
    this.client = client;
    client.on('connect', () => this.onConnect(client));
    client.on('close', () => this.onClose(client));
    client.on('error', (err) => {
      logger.warn(`MQTT error: ${err.message}`);
      this.emit('error', err);
    });
    client.on('message', (topic, payload) => this.onMessage(topic, payload));
  }

  signedUrl() {
    return presignIotWebsocketUrl({ host: IOT_ENDPOINT, credentials: this.credentials });
  }

  onConnect(client) {
    if (client !== this.client) return;
    this.connected = true;
    logger.info(`Connected to the HomeWhiz cloud (${this.applianceIds.length} appliance(s))`);
    const topics = this.applianceIds.flatMap((id) => [
      `$aws/things/${id}/shadow/update/accepted`,
      `$aws/things/${id}/shadow/get/accepted`,
    ]);
    if (topics.length === 0) {
      this.emit('connected');
      return;
    }
    client.subscribe(topics, { qos: 1 }, (err) => {
      if (err) {
        logger.error(`MQTT subscription failed: ${err.message}`);
        this.emit('error', err);
        return;
      }
      this.emit('connected');
      for (const id of this.applianceIds) {
        this.requestState(id).catch((e) =>
          logger.debug(`Initial read of ${id} failed: ${e.message}`),
        );
      }
    });
  }

  onClose(client) {
    if (client !== this.client || !this.connected) return;
    this.connected = false;
    logger.warn('Disconnected from the HomeWhiz cloud, reconnecting...');
    this.emit('disconnected');
  }

  onMessage(topic, payload) {
    const match = SHADOW_TOPIC.exec(topic);
    if (!match) return;
    const applianceId = match[1];
    try {
      const message = JSON.parse(payload.toString());
      const connected = message?.state?.reported?.connected;
      if (connected !== undefined && connected !== null) {
        this.emit('online', applianceId, connected === true || connected === 'true');
      }
      const data = shadowPayloadToData(message);
      if (data) {
        this.emit('data', applianceId, data);
      }
    } catch (err) {
      logger.warn(`Unreadable message for ${applianceId}: ${err.message}`);
    }
  }

  publish(topic, message, qos = 0) {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.connected) {
        reject(new Error('Not connected to the HomeWhiz cloud'));
        return;
      }
      this.client.publish(topic, message, { qos }, (err) => (err ? reject(err) : resolve()));
    });
  }

  /** Ask the appliance to report its state now (+ the last shadow). */
  async requestState(applianceId) {
    const read = { type: `fread/${commandSuffix(applianceId)}` };
    if (isTuya(applianceId)) read.applianceId = applianceId;
    await this.publish(`$aws/things/${applianceId}/shadow/get`, JSON.stringify(read));
    await this.publish(`$aws/things/${applianceId}/shadow/get`, '{}');
  }

  /**
   * Send `[index, value]` writes, one after the other, then read back.
   * @param {string} applianceId
   * @param {Array<{index: number, value: number}>} commands
   */
  async sendCommands(applianceId, commands) {
    for (const [position, command] of commands.entries()) {
      const message = { type: 'write', prm: `[${command.index},${command.value}]` };
      if (isTuya(applianceId)) message.applianceId = applianceId;
      logger.info(`Command ${applianceId} [${command.index},${command.value}]`);
      await this.publish(
        `${applianceId}/${commandSuffix(applianceId)}`,
        JSON.stringify(message),
        1,
      );
      if (position < commands.length - 1 || this.commandSpacingMs > 0) {
        await sleep(this.commandSpacingMs);
      }
    }
    await this.requestState(applianceId).catch(() => {});
  }

  scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    const expiration =
      Number(this.credentials?.expiration) || Date.now() + DEFAULT_CREDENTIALS_LIFETIME_MS;
    const delay = Math.max(MIN_REFRESH_DELAY_MS, expiration - Date.now() - REFRESH_MARGIN_MS);
    this.refreshTimer = setTimeout(() => this.refreshCredentials(), delay);
    this.refreshTimer.unref?.();
  }

  /** New temporary credentials, then a new connection signed with them. */
  async refreshCredentials() {
    if (this.stopped) return;
    try {
      this.credentials = await this.login(this.username, this.password);
      logger.debug('HomeWhiz credentials refreshed');
      const previous = this.client;
      this.client = null;
      this.connected = false;
      previous?.end(true);
      this.openClient();
    } catch (err) {
      if (err instanceof LoginError) {
        // The account refused the password (changed?): never retry in a
        // loop, HomeWhiz locks an account after a few wrong attempts.
        logger.error('HomeWhiz refused the credentials, reconfigure the integration');
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
        this.emit('auth-failed', err);
        return;
      }
      logger.warn(`Credentials refresh failed, retrying in a minute: ${err.message}`);
      this.emit('error', err);
    }
    this.scheduleRefresh();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.refreshTimer);
    const client = this.client;
    this.client = null;
    this.connected = false;
    if (client) {
      await new Promise((resolve) => client.end(true, {}, () => resolve()));
    }
  }
}
