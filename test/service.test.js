import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { HomeWhizService, SCENE_TRIGGERS, COMMANDS } from '../src/homewhiz/service.js';
import {
  AC_ID,
  FakeCloud,
  WASHER_ID,
  WASHER_ON,
  WASHER_RUNNING,
  fakeApi,
  memoryStore,
  startedService,
} from './helpers.js';

const stateOf = (gladys, externalId) =>
  gladys.fake.states.filter((s) => s.device_feature_external_id === externalId).at(-1);

test('the Wi-Fi appliances are published, the Bluetooth-only ones skipped', async () => {
  const { gladys, service, cloud } = await startedService();
  const devices = gladys.fake.discoveredDevices;
  assert.equal(devices.length, 2);
  assert.deepEqual(cloud.started, [WASHER_ID, AC_ID]);
  assert.equal(service.skipped.length, 1);
  const washer = devices.find((d) => d.external_id === service.ids(WASHER_ID).device);
  assert.equal(washer.name, 'Lave-linge');
  assert.equal(washer.poll_frequency, 60_000);
  // A nameless appliance is named after its brand and type.
  const ac = devices.find((d) => d.external_id === service.ids(AC_ID).device);
  assert.equal(ac.name, 'Grundig Air conditioner');
  assert.deepEqual(gladys.fake.connectionStatus?.connected ?? true, true);
});

test('every feature carries what Gladys needs to create it', async () => {
  const { gladys } = await startedService();
  for (const device of gladys.fake.discoveredDevices) {
    const ids = new Set();
    for (const feature of device.features) {
      assert.ok(!ids.has(feature.external_id), `duplicate ${feature.external_id}`);
      ids.add(feature.external_id);
      for (const field of ['name', 'min', 'max', 'read_only', 'has_feedback', 'category', 'type']) {
        assert.notEqual(feature[field], undefined, `${feature.external_id}.${field}`);
      }
      assert.match(feature.external_id, /^[^#\s]+$/);
      if (feature.type === 'select') {
        assert.ok(feature.supported_options.length > 0, `${feature.external_id} options`);
      }
    }
  }
});

test('feature names follow the configured language', async () => {
  const { gladys } = await startedService({ language: 'fr' });
  const washer = gladys.fake.discoveredDevices.find((d) => d.name === 'Lave-linge');
  const names = washer.features.map((f) => f.name);
  assert.ok(names.includes('État'));
  assert.ok(names.includes('Marche / arrêt'));
  const program = washer.features.find((f) => f.external_id.endsWith(':washer_program'));
  assert.ok(program.supported_options.some((o) => o.label === 'Coton'));
});

test('a report publishes the states: text for choices, numbers otherwise', async () => {
  const { gladys, service } = await startedService();
  await service.onData(WASHER_ID, WASHER_RUNNING);
  const ids = service.ids(WASHER_ID);
  assert.equal(stateOf(gladys, ids.feature('state')).text, 'device_state_running');
  assert.equal(stateOf(gladys, ids.feature('power')).state, 1);
  assert.equal(stateOf(gladys, ids.feature('washer_program')).text, 'program_cottons');
  assert.equal(stateOf(gladys, ids.feature('washer_remaining')).state, 57);
  assert.equal(stateOf(gladys, ids.feature('washer_prewash')).state, 0);
  assert.equal(stateOf(gladys, ids.feature('warnings')).text, '');
  // Unchanged values are not sent twice.
  const count = gladys.fake.states.length;
  await service.onData(WASHER_ID, WASHER_RUNNING);
  assert.equal(gladys.fake.states.length, count);
});

test('a cycle fires started then finished, once each', async () => {
  const { gladys, service } = await startedService();
  await service.onData(WASHER_ID, WASHER_ON);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'no event on the first report');
  await service.onData(WASHER_ID, WASHER_RUNNING);
  await service.onData(WASHER_ID, WASHER_RUNNING);
  assert.deepEqual(
    gladys.fake.sceneEvents.map((e) => e.key),
    [SCENE_TRIGGERS.CYCLE_STARTED],
  );
  await service.onData(WASHER_ID, WASHER_ON);
  const [started, finished] = gladys.fake.sceneEvents;
  assert.equal(finished.key, SCENE_TRIGGERS.CYCLE_FINISHED);
  assert.equal(started.data.device, service.ids(WASHER_ID).device);
  assert.equal(finished.data.program, 'Cottons');
});

test('a new warning fires warning_raised with its label', async () => {
  const { gladys, service } = await startedService();
  await service.onData(WASHER_ID, WASHER_RUNNING);
  const appliance = service.appliances.get(WASHER_ID);
  const door = appliance.controls.find((c) => c.key === 'washer_warning_door_is_open');
  const data = Uint8Array.from(WASHER_RUNNING);
  data[door.readIndex] |= 1 << door.bit;
  await service.onData(WASHER_ID, data);
  const event = gladys.fake.sceneEvents.find((e) => e.key === SCENE_TRIGGERS.WARNING_RAISED);
  assert.equal(event.data.warning, 'washer_warning_door_is_open');
  assert.ok(event.data.warning_label.length > 0);
  const ids = service.ids(WASHER_ID);
  assert.equal(stateOf(gladys, ids.feature('warnings')).text, event.data.warning_label);
});

test('a Gladys command is translated into HomeWhiz writes', async () => {
  const { service, cloud } = await startedService();
  const ids = service.ids(WASHER_ID);
  await service.setValue(ids.device, ids.feature('washer_program'), 'program_cottons');
  await service.setValue(ids.device, ids.feature('power'), 0);
  const [program, power] = cloud.sent;
  assert.equal(program.id, WASHER_ID);
  assert.equal(program.commands[0].value, 1);
  assert.equal(power.commands[0].value, 20, 'device_state_off');
  await assert.rejects(
    service.setValue(ids.device, ids.feature('washer_remaining'), 3),
    /read only/,
  );
});

test('air conditioner commands use the Gladys AC features', async () => {
  const { service, cloud } = await startedService();
  const ids = service.ids(AC_ID);
  await service.setValue(ids.device, ids.feature('ac-power'), 1);
  await service.setValue(ids.device, ids.feature('ac-mode'), 0);
  await service.setValue(ids.device, ids.feature('ac-target-temperature'), 22);
  assert.deepEqual(
    cloud.sent.map((s) => s.commands),
    [[{ index: 43, value: 10 }], [{ index: 34, value: 6 }], [{ index: 35, value: 22 }]],
  );
});

test('start refuses politely when the appliance remote control is off', async () => {
  const { service, cloud } = await startedService();
  await service.onData(WASHER_ID, WASHER_ON); // remote control byte = disabled
  const result = await service.runCommand(service.ids(WASHER_ID).device, COMMANDS.START);
  assert.deepEqual(result, { ok: false, reason: 'remote_control_disabled' });
  assert.equal(cloud.sent.length, 0);
});

test('start with a program (by label) and a delay', async () => {
  const { service, cloud } = await startedService();
  const appliance = service.appliances.get(WASHER_ID);
  const remote = appliance.controls.find((c) => c.key === 'remote_control');
  const data = Uint8Array.from(WASHER_ON);
  data[remote.readIndex] = 170; // enabled (wifiArrayValue of the fixture)
  await service.onData(WASHER_ID, data);
  assert.equal(service.statusOf(appliance).remoteControl, true);
  const result = await service.runCommand(service.ids(WASHER_ID).device, COMMANDS.START, {
    program: 'coton',
    delayMinutes: 90,
  });
  assert.deepEqual(result, { ok: true });
  const commands = cloud.sent[0].commands;
  assert.equal(commands.length, 4, 'program, delay hours, delay minutes, running');
  assert.equal(commands.at(-1).value, 30, 'device_state_running');
  const unknown = await service.runCommand(service.ids(WASHER_ID).device, COMMANDS.START, {
    program: 'nope',
  });
  assert.equal(unknown.reason, 'unknown_program');
});

test('a refused sign-in reports the connection status, no device', async () => {
  const gladys = createFakeGladys();
  const service = new HomeWhizService(gladys, {
    api: fakeApi,
    createCloud: () => new FakeCloud(),
    store: memoryStore(),
  });
  assert.equal(await service.start({ username: 'me', password: 'bad', language: 'en' }), false);
  assert.equal(service.cloud, null);
  assert.equal(await service.start({ username: '', password: '', language: 'en' }), false);
});

test('polls ask the appliance for a fresh report', async () => {
  const { service, cloud } = await startedService();
  assert.equal(await service.poll(service.ids(WASHER_ID).device), true);
  assert.deepEqual(cloud.reads, [WASHER_ID]);
  assert.equal(await service.poll('ext:unknown'), false);
});

test('the configurations are cached between starts', async () => {
  let downloads = 0;
  const api = {
    ...fakeApi,
    fetchApplianceContents: async (...args) => {
      downloads += 1;
      return fakeApi.fetchApplianceContents(...args);
    },
  };
  const service = new HomeWhizService(createFakeGladys(), {
    api,
    createCloud: () => new FakeCloud(),
    store: memoryStore(),
  });
  const config = { username: 'me', password: 'good', language: 'en' };
  await service.start(config);
  await service.start(config);
  assert.equal(downloads, 2, 'one per appliance, not per start');
  await service.refreshAppliances();
  assert.equal(downloads, 4);
});
