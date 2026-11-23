// The controls are a port of the Home Assistant HomeWhiz integration: the
// expected values below are the ones its own tests assert on the same bytes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AC_MODES,
  CONTROL_KINDS,
  generateControls,
  shadowPayloadToData,
  toFriendlyName,
} from '../src/homewhiz/controls.js';
import { WASHER_ON, WASHER_RUNNING, fixture } from './helpers.js';

const valuesOf = (controls, data) =>
  Object.fromEntries(controls.map((control) => [control.key, control.getValue(data)]));

test('toFriendlyName builds stable snake_case keys', () => {
  assert.equal(toFriendlyName('PROGRAM_COTTONS'), 'program_cottons');
  assert.equal(toFriendlyName('FAST+'), 'fastplus');
  assert.equal(toFriendlyName('1200 RPM_'), '1200rpm');
});

test('a running washing machine reads like in Home Assistant', () => {
  const values = valuesOf(generateControls(fixture('washing-machine')), WASHER_RUNNING);
  assert.equal(values.state, 'device_state_running');
  assert.equal(values.sub_state, 'washer_substate_washing');
  assert.equal(values.washer_program, 'program_cottons');
  assert.equal(values.washer_temperature, 'temperature_30');
  assert.equal(values.washer_spin, '1200rpm');
  assert.equal(values.washer_prewash, false);
  assert.equal(values.washer_duration, 137);
  assert.equal(values.washer_remaining, 57);
  assert.equal(values.remote_control, false);
  assert.equal(values.washer_warning_door_is_open, false);
  assert.equal(values['delay_start_set#0'], 0);
});

test('a washing machine switched on, not running', () => {
  const values = valuesOf(generateControls(fixture('washing-machine')), WASHER_ON);
  assert.equal(values.state, 'device_state_on');
  assert.equal(values.sub_state, null);
  assert.equal(values.washer_remaining, 137);
});

test('the remaining time reads 0 once the washing machine is off', () => {
  const controls = generateControls(fixture('washing-machine'));
  const state = controls.find((c) => c.key === 'state');
  const off = Uint8Array.from(WASHER_RUNNING);
  const [{ index, value }] = state.setValue('device_state_off');
  // Write and read indices differ on this appliance: read back on the read one.
  assert.equal(typeof index, 'number');
  off[state.readIndex] = value;
  assert.equal(valuesOf(controls, off).washer_remaining, 0);
});

test('on/off choices become switches, others stay choices', () => {
  const byKey = new Map(generateControls(fixture('washing-machine')).map((c) => [c.key, c]));
  assert.equal(byKey.get('washer_prewash').kind, CONTROL_KINDS.WRITE_BOOLEAN);
  assert.equal(byKey.get('washer_program').kind, CONTROL_KINDS.WRITE_ENUM);
  assert.equal(byKey.get('sub_state').kind, CONTROL_KINDS.ENUM);
  assert.equal(byKey.get('washer_remaining').kind, CONTROL_KINDS.TIME);
  assert.equal(byKey.get('delay_start_set#0').kind, CONTROL_KINDS.WRITE_TIME);
});

test('writes resolve [index, value] commands', () => {
  const byKey = new Map(generateControls(fixture('washing-machine')).map((c) => [c.key, c]));
  const program = byKey.get('washer_program');
  assert.deepEqual(program.setValue('program_cottons'), [{ index: program.writeIndex, value: 1 }]);
  assert.throws(() => program.setValue('nope'), /Unknown option/);
  const delay = byKey.get('delay_start_set#0');
  assert.deepEqual(delay.setValue(135), [
    { index: delay.hourIndex, value: 2 },
    { index: delay.minuteIndex, value: 15 },
  ]);
});

test('an air conditioner is grouped into one climate control', () => {
  const controls = generateControls(fixture('air-conditioner'));
  const climate = controls.find((c) => c.kind === CONTROL_KINDS.CLIMATE);
  assert.ok(climate);
  const off = new Uint8Array(96);
  off[34] = 0x04; // heating
  off[35] = 0x1a; // target 26 °C
  off[40] = 0x1c; // room 28 °C
  off[43] = 0x14; // off
  assert.deepEqual(climate.getValue(off), {
    power: false,
    mode: AC_MODES.HEATING,
    target_temperature: 26,
    room_temperature: 28,
    fan_speed: 'wind_strength_low',
  });
  // Same commands as the Home Assistant tests: power on, then auto mode.
  assert.deepEqual(climate.power.setValue(true), [{ index: 43, value: 10 }]);
  assert.deepEqual(climate.setMode(AC_MODES.AUTO), [{ index: 34, value: 6 }]);
  assert.deepEqual(climate.power.setValue(false), [{ index: 43, value: 20 }]);
});

test('every fixture builds controls with unique keys and readable values', () => {
  for (const name of ['hob', 'oven', 'refrigerator', 'dishwasher', 'dryer']) {
    const controls = generateControls(fixture(name));
    assert.ok(controls.length > 5, `${name}: controls`);
    const keys = controls.map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length, `${name}: unique keys`);
    const zeros = new Uint8Array(200);
    for (const control of controls) {
      assert.doesNotThrow(() => control.getValue(zeros), `${name}.${control.key}`);
    }
  }
});

test('hob zones switch the zone mode with the heater level', () => {
  const controls = generateControls(fixture('hob'));
  const level = controls.find((c) => c.key === 'zone_2_hob_heater_level');
  const commands = level.setValue(5);
  assert.equal(commands.length, 2, 'mode switch + level');
  assert.equal(commands[1].value, 5);
});

test('shadow payloads decode into the byte array', () => {
  const data = shadowPayloadToData(
    JSON.stringify({ state: { reported: { wfa: [1, 2, 3], wfaStartOffset: 2 } } }),
  );
  assert.deepEqual([...data], [0, 0, 1, 2, 3]);
  assert.equal(shadowPayloadToData({ state: { reported: { connected: true } } }), null);
  assert.equal(shadowPayloadToData({ state: { reported: { wfa: [7] } } }).length, 27);
});
