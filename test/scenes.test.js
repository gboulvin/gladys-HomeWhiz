import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSceneActions } from '../src/scenes.js';
import { SCENE_TRIGGERS } from '../src/homewhiz/service.js';
import { WASHER_ID, WASHER_ON, WASHER_RUNNING, startedService } from './helpers.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const declarationOf = (list, key) => manifest[list].find((entry) => entry.key === key);
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

test('scene events only carry the keys their trigger declares', async () => {
  const { gladys, service } = await startedService();
  await service.onData(WASHER_ID, WASHER_ON);
  await service.onData(WASHER_ID, WASHER_RUNNING);
  const door = service.appliances
    .get(WASHER_ID)
    .controls.find((c) => c.key === 'washer_warning_door_is_open');
  const warning = Uint8Array.from(WASHER_RUNNING);
  warning[door.readIndex] |= 1 << door.bit;
  await service.onData(WASHER_ID, warning);
  await service.onData(WASHER_ID, WASHER_ON);
  const fired = new Set(gladys.fake.sceneEvents.map((e) => e.key));
  assert.deepEqual([...fired].sort(), Object.values(SCENE_TRIGGERS).sort());
  for (const { key, data } of gladys.fake.sceneEvents) {
    const trigger = declarationOf('scene_triggers', key);
    const declared = [...keysOf(trigger.fields), ...keysOf(trigger.variables)];
    for (const [name, value] of Object.entries(data)) {
      assert.ok(declared.includes(name), `${key}: data.${name} is not declared`);
      assert.ok(value === null || typeof value !== 'object', `${key}: data.${name} is a primitive`);
    }
    // A `"source": "devices"` filter stores a device external_id.
    assert.equal(data.device, service.ids(WASHER_ID).device);
  }
});

test('scene actions return their declared outputs', async () => {
  const { service, cloud } = await startedService();
  const actions = createSceneActions(() => service);
  const device = service.ids(WASHER_ID).device;
  const outputs = await actions.control_appliance(null, { fields: { device, command: 'pause' } });
  assert.deepEqual(outputs, { success: true, reason: '' });
  assert.equal(cloud.sent.length, 1);
  for (const key of Object.keys(actions)) {
    const declared = keysOf(declarationOf('scene_actions', key).outputs);
    for (const output of Object.keys(outputs)) {
      assert.ok(declared.includes(output), `${key}: output ${output} is not declared`);
    }
  }
});

test('start_program reports a refusal through its outputs, never a failure', async () => {
  const { service } = await startedService();
  const actions = createSceneActions(() => service);
  await service.onData(WASHER_ID, WASHER_ON); // remote control disabled
  const outputs = await actions.start_program(null, {
    fields: { device: service.ids(WASHER_ID).device, program: '', delay_minutes: 0 },
  });
  assert.deepEqual(outputs, { success: false, reason: 'remote_control_disabled' });
  const unknown = await actions.control_appliance(null, {
    fields: { device: 'ext:homewhiz:appliance:none', command: 'start' },
  });
  assert.deepEqual(unknown, { success: false, reason: 'unknown_device' });
});

test('every control_appliance option is a command the service knows', async () => {
  const { service } = await startedService();
  const options = declarationOf('scene_actions', 'control_appliance')
    .fields.find((field) => field.key === 'command')
    .options.map((option) => option.value);
  for (const command of options) {
    const result = await service.runCommand(service.ids(WASHER_ID).device, command);
    assert.notEqual(result.reason, 'unknown_command', command);
  }
});
