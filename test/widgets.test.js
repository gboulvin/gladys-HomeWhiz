import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  WIDGET_KEYS,
  createWidgetRefresher,
  createWidgets,
  formatMinutes,
} from '../src/widgets.js';
import { WASHER_ID, WASHER_ON, WASHER_RUNNING, startedService } from './helpers.js';

const LANGUAGES = ['en', 'fr', 'de', 'es'];

async function setup() {
  const context = await startedService();
  const widgets = createWidgets(() => context.service);
  const get = (key, settings = {}, language = 'en') =>
    widgets[key].get(context.gladys, { settings, language, units: 'metric' });
  return { ...context, widgets, get };
}

test('the overview content is rendered exactly as sent, in every language', async () => {
  const { service, get } = await setup();
  assert.deepEqual(validateWidgetContent(await get(WIDGET_KEYS.OVERVIEW)), [], 'before any report');
  await service.onData(WASHER_ID, WASHER_RUNNING);
  for (const language of LANGUAGES) {
    const content = await get(WIDGET_KEYS.OVERVIEW, {}, language);
    assert.deepEqual(validateWidgetContent(content), [], language);
  }
  const [list] = (await get(WIDGET_KEYS.OVERVIEW, {}, 'fr')).components;
  const washer = list.items.find((item) => item.title === 'Lave-linge');
  assert.equal(washer.badge.text, 'En cours');
  assert.match(washer.subtitle, /Coton/);
  assert.match(washer.subtitle, /57 min restant/);
});

test('the appliance status content is valid in every state and language', async () => {
  const { service, get } = await setup();
  const settings = { device: service.ids(WASHER_ID).device };
  assert.deepEqual(validateWidgetContent(await get(WIDGET_KEYS.STATUS, settings)), []);
  for (const data of [WASHER_ON, WASHER_RUNNING]) {
    await service.onData(WASHER_ID, data);
    for (const language of LANGUAGES) {
      const content = await get(WIDGET_KEYS.STATUS, settings, language);
      assert.deepEqual(validateWidgetContent(content), [], language);
    }
  }
  const content = await get(WIDGET_KEYS.STATUS, settings);
  const gauge = content.components.find((c) => c.type === 'gauge');
  assert.equal(gauge.value, 58, '(137 - 57) / 137');
  const buttons = content.components.filter((c) => c.type === 'button').map((b) => b.action.key);
  assert.deepEqual(buttons, ['pause', 'power_off']);
});

test('a widget without a known appliance asks to pick one', async () => {
  const { get } = await setup();
  const content = await get(WIDGET_KEYS.STATUS, { device: 'ext:none' }, 'de');
  assert.deepEqual(validateWidgetContent(content), []);
  assert.match(content.components[0].text, /Gerät/);
});

test('every button action is handled and answers a short toast', async () => {
  const { service, widgets, get, gladys } = await setup();
  const settings = { device: service.ids(WASHER_ID).device };
  await service.onData(WASHER_ID, WASHER_RUNNING);
  const buttons = (await get(WIDGET_KEYS.STATUS, settings)).components.filter(
    (c) => c.type === 'button',
  );
  for (const { action } of buttons) {
    const toast = await widgets[WIDGET_KEYS.STATUS].action(gladys, {
      actionKey: action.key,
      params: action.params,
      settings,
    });
    assert.ok(toast.en && toast.en.length <= 200);
  }
  await assert.rejects(
    widgets[WIDGET_KEYS.STATUS].action(gladys, { actionKey: 'nope', params: {}, settings }),
    /Unknown widget action/,
  );
});

test('the refresher nudges every widget, throttled', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const gladys = createFakeGladys();
  const refresh = createWidgetRefresher(gladys, { aa: {}, bb: {} }, 15_000);
  refresh();
  refresh();
  refresh();
  assert.deepEqual(gladys.fake.widgetRefreshes, ['aa', 'bb']);
  t.mock.timers.tick(15_000);
  assert.deepEqual(gladys.fake.widgetRefreshes, ['aa', 'bb', 'aa', 'bb'], 'one deferred nudge');
});

test('durations read naturally', () => {
  assert.equal(formatMinutes(57), '57 min');
  assert.equal(formatMinutes(137), '2 h 17');
});
