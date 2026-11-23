import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { HomeWhizCloud, IOT_ENDPOINT } from '../src/homewhiz/cloud.js';
import { presignIotWebsocketUrl, signGetRequest } from '../src/homewhiz/sigv4.js';

const credentials = {
  accessKey: 'AKIDEXAMPLE',
  secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  sessionToken: 'token/with+chars=',
  expiration: Date.now() + 3_600_000,
};
const date = new Date('2026-11-23T20:15:00Z');

test('signed GET requests carry the SigV4 headers', () => {
  const headers = signGetRequest({
    host: 'api.arcelikiot.com',
    path: '/procam/contents',
    query: 'a=1',
    credentials,
    date,
  });
  assert.equal(headers['x-amz-date'], '20261123T201500Z');
  assert.equal(headers['x-amz-security-token'], credentials.sessionToken);
  assert.match(
    headers.Authorization,
    /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20261123\/eu-west-1\/execute-api\/aws4_request, SignedHeaders=host;x-amz-date;x-amz-security-token, Signature=[0-9a-f]{64}$/,
  );
  const other = signGetRequest({
    host: 'api.arcelikiot.com',
    path: '/procam/contents',
    query: 'a=2',
    credentials,
    date,
  });
  assert.notEqual(other.Authorization, headers.Authorization, 'the query is signed');
});

test('the IoT WebSocket URL is pre-signed, the token appended after the signature', () => {
  const url = new URL(presignIotWebsocketUrl({ host: IOT_ENDPOINT, credentials, date }));
  assert.equal(url.protocol, 'wss:');
  assert.equal(url.pathname, '/mqtt');
  assert.equal(
    url.searchParams.get('X-Amz-Credential'),
    'AKIDEXAMPLE/20261123/eu-west-1/iotdevicegateway/aws4_request',
  );
  assert.match(url.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/);
  assert.equal(url.searchParams.get('X-Amz-Security-Token'), credentials.sessionToken);
  assert.ok(url.search.indexOf('X-Amz-Signature') < url.search.indexOf('X-Amz-Security-Token'));
});

class FakeMqttClient extends EventEmitter {
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.subscriptions = [];
    this.published = [];
    this.ended = false;
  }
  subscribe(topics, _options, callback) {
    this.subscriptions.push(...topics);
    callback(null);
  }
  publish(topic, message, options, callback) {
    this.published.push({ topic, message: JSON.parse(message), qos: options.qos });
    callback(null);
  }
  end(_force, _options, callback) {
    this.ended = true;
    callback?.();
  }
}

function cloudWithFakeMqtt() {
  const clients = [];
  const cloud = new HomeWhizCloud({
    username: 'me',
    password: 'secret',
    login: async () => credentials,
    connectMqtt: (url, options) => {
      const client = new FakeMqttClient(url, options);
      clients.push(client);
      return client;
    },
    commandSpacingMs: 0,
  });
  return { cloud, clients };
}

test('connecting subscribes to the shadow topics and reads every appliance', async () => {
  const { cloud, clients } = cloudWithFakeMqtt();
  await cloud.start(['A1', 'T2']);
  const [client] = clients;
  assert.match(client.url, /^wss:\/\//);
  assert.equal(typeof client.options.transformWsUrl, 'function', 'URL re-signed on reconnect');
  client.emit('connect');
  assert.deepEqual(client.subscriptions, [
    '$aws/things/A1/shadow/update/accepted',
    '$aws/things/A1/shadow/get/accepted',
    '$aws/things/T2/shadow/update/accepted',
    '$aws/things/T2/shadow/get/accepted',
  ]);
  await new Promise((resolve) => setImmediate(resolve));
  const reads = client.published.filter((p) => p.message.type?.startsWith('fread'));
  assert.deepEqual(
    reads.map((r) => r.message),
    [{ type: 'fread/command' }, { type: 'fread/tuyacommand', applianceId: 'T2' }],
  );
  await cloud.stop();
  assert.ok(client.ended);
});

test('shadow reports become data events', async () => {
  const { cloud, clients } = cloudWithFakeMqtt();
  await cloud.start(['A1']);
  const received = [];
  cloud.on('data', (id, data) => received.push({ id, data }));
  cloud.on('online', (id, online) => received.push({ id, online }));
  clients[0].emit(
    'message',
    '$aws/things/A1/shadow/update/accepted',
    Buffer.from(
      JSON.stringify({ state: { reported: { connected: 'true', wfa: [5], wfaStartOffset: 1 } } }),
    ),
  );
  clients[0].emit('message', 'other/topic', Buffer.from('{}'));
  clients[0].emit('message', '$aws/things/A1/shadow/get/accepted', Buffer.from('not json'));
  assert.deepEqual(received, [
    { id: 'A1', online: true },
    { id: 'A1', data: Uint8Array.from([0, 5]) },
  ]);
  await cloud.stop();
});

test('commands are published one by one, then read back', async () => {
  const { cloud, clients } = cloudWithFakeMqtt();
  await cloud.start(['A1']);
  clients[0].emit('connect');
  clients[0].published = [];
  await cloud.sendCommands('A1', [
    { index: 36, value: 2 },
    { index: 34, value: 30 },
  ]);
  const writes = clients[0].published.filter((p) => p.topic === 'A1/command');
  assert.deepEqual(
    writes.map((w) => w.message),
    [
      { type: 'write', prm: '[36,2]' },
      { type: 'write', prm: '[34,30]' },
    ],
  );
  assert.ok(writes.every((w) => w.qos === 1));
  assert.ok(clients[0].published.some((p) => p.topic === '$aws/things/A1/shadow/get'));
  await cloud.stop();
});

test('a command while disconnected fails', async () => {
  const { cloud } = cloudWithFakeMqtt();
  await cloud.start(['A1']);
  await assert.rejects(cloud.sendCommands('A1', [{ index: 1, value: 1 }]), /Not connected/);
  await cloud.stop();
});

test('refreshing the credentials opens a new connection', async () => {
  const { cloud, clients } = cloudWithFakeMqtt();
  await cloud.start(['A1']);
  await cloud.refreshCredentials();
  assert.equal(clients.length, 2);
  assert.ok(clients[0].ended);
  await cloud.stop();
});

test('a refused password is never retried in a loop', async () => {
  const { LoginError } = await import('../src/homewhiz/api.js');
  const { cloud } = cloudWithFakeMqtt();
  await cloud.start(['A1']);
  let attempts = 0;
  cloud.login = async () => {
    attempts += 1;
    throw new LoginError('Username or password is wrong');
  };
  const failures = [];
  cloud.on('auth-failed', (err) => failures.push(err.message));
  await cloud.refreshCredentials();
  assert.equal(attempts, 1);
  assert.deepEqual(failures, ['Username or password is wrong']);
  assert.equal(cloud.refreshTimer, null, 'no retry scheduled');
  await cloud.stop();
});
