// Shared fakes: a HomeWhiz account with a washing machine (Wi-Fi), an air
// conditioner (Wi-Fi) and a Bluetooth-only dishwasher, and a cloud channel
// that records the commands. No network.

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { HomeWhizService } from '../src/homewhiz/service.js';
import { isBluetoothOnly } from '../src/homewhiz/api.js';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

export const WASHER_ID = '7127441700';
export const AC_ID = 'AC0001';

// A running washing machine (cotton 30 °C, 57 minutes left), from the Home
// Assistant integration tests.
export const WASHER_RUNNING = Uint8Array.from(
  Buffer.from(
    '002f4a45a10100000000000000000000000000000000000000000200000000000000001e819e0c' +
      '0080000080021100398080010000000000000000000080808100800000008001078000808000',
    'hex',
  ),
);
export const WASHER_ON = Uint8Array.from(
  Buffer.from(
    '002f4a45a10100000000000000000000000000000000000000000200000000000000000a011e0c' +
      '0000000080021102110000000000000000000000000000000100000000000001070000000000',
    'hex',
  ),
);

export const APPLIANCES = [
  {
    applianceId: WASHER_ID,
    name: 'Lave-linge',
    brand: 3,
    model: 'WTV8744',
    applianceType: 1,
    connectivity: 'WIFI',
  },
  { applianceId: AC_ID, name: '', brand: 2, model: 'GAC', applianceType: 9, connectivity: 'WIFI' },
  { applianceId: 'BT0001', name: 'Dishwasher', brand: 2, applianceType: 3, connectivity: 'BT' },
];

export const CONTENTS = {
  [WASHER_ID]: { config: fixture('washing-machine'), localization: {} },
  [AC_ID]: { config: fixture('air-conditioner'), localization: {} },
};

export class FakeCloud extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.reads = [];
    this.started = null;
  }
  async start(ids) {
    this.started = ids;
    this.emit('connected');
  }
  async stop() {}
  async requestState(id) {
    this.reads.push(id);
  }
  async sendCommands(id, commands) {
    this.sent.push({ id, commands });
  }
}

export const fakeApi = {
  isBluetoothOnly,
  async login(username, password) {
    if (password !== 'good') throw new Error('refused');
    return { accessKey: 'AK', secretKey: 'SK', sessionToken: 'TK', expiration: Date.now() + 3e6 };
  },
  async fetchAppliances() {
    return APPLIANCES;
  },
  async fetchApplianceContents(_credentials, id) {
    return structuredClone(CONTENTS[id]);
  },
};

export const memoryStore = () => {
  const map = new Map();
  return { get: async (k) => map.get(k) ?? null, set: async (k, v) => void map.set(k, v) };
};

/** A started service over the fake account. */
export async function startedService({ language = 'en', onAppliancesChanged } = {}) {
  const gladys = createFakeGladys();
  const cloud = new FakeCloud();
  const service = new HomeWhizService(gladys, {
    api: fakeApi,
    createCloud: () => cloud,
    store: memoryStore(),
    onAppliancesChanged,
  });
  await service.start({ username: 'me@example.com', password: 'good', language });
  return { gladys, cloud, service };
}
