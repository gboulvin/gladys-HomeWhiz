import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LoginError,
  fetchApplianceContents,
  fetchAppliances,
  isBluetoothOnly,
  login,
} from '../src/homewhiz/api.js';

const credentials = { accessKey: 'AK', secretKey: 'SK', sessionToken: 'TK', expiration: 1 };

/** A fetch answering from a route table, recording the calls. */
function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const route = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    const [status, body] = route ? routes[route] : [404, { message: 'not found' }];
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  };
  return { fetch, calls };
}

test('login resolves the temporary credentials', async () => {
  const { fetch, calls } = fakeFetch({
    'https://api.arcelikiot.com/auth/login': [200, { success: true, data: { credentials } }],
  });
  assert.deepEqual(await login('me@example.com', 'pw', { fetch }), credentials);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    username: 'me@example.com',
    password: 'pw',
  });
});

test('a refused login throws a LoginError', async () => {
  const { fetch } = fakeFetch({
    'https://api.arcelikiot.com/auth/login': [401, { success: false, message: 'Bad credentials' }],
  });
  await assert.rejects(login('me', 'bad', { fetch }), LoginError);
});

test('the appliances of every home are listed, with signed requests', async () => {
  const { fetch, calls } = fakeFetch({
    'https://smarthome.arcelikiot.com/my-homes/1': [
      200,
      { data: { appliances: [{ applianceId: 'A' }] } },
    ],
    'https://smarthome.arcelikiot.com/my-homes/2': [
      200,
      { data: { appliances: [{ applianceId: 'B' }] } },
    ],
    'https://smarthome.arcelikiot.com/my-homes': [200, { data: [{ id: 1 }, { id: 2 }] }],
  });
  const appliances = await fetchAppliances(credentials, { fetch });
  assert.deepEqual(
    appliances.map((a) => a.applianceId),
    ['A', 'B'],
  );
  assert.match(calls[0].options.headers.Authorization, /^AWS4-HMAC-SHA256 /);
});

test('the configuration and the labels of an appliance are downloaded', async () => {
  const { fetch, calls } = fakeFetch({
    'https://api.arcelikiot.com/procam/contents': [
      200,
      {
        data: {
          results: [
            { cid: 'C1', ctype: 'CONFIGURATION', ver: 3, lang: 'fr-FR' },
            { cid: 'L1', ctype: 'LOCALIZATION', ver: 1, lang: 'fr-FR' },
          ],
        },
      },
    ],
    'https://s3-eu-west-1.amazonaws.com/procam-contents/CONFIGURATIONS/C1/v3/C1.fr-FR.json': [
      200,
      { subPrograms: [{ strKey: 'X', enumValues: [{ strKey: 12, wifiArrayValue: 1 }] }] },
    ],
    'https://s3-eu-west-1.amazonaws.com/procam-contents/LOCALIZATIONS/L1/v1/L1.fr-FR.json': [
      200,
      { localizations: { PROGRAM_COTTONS: 'Coton' } },
    ],
  });
  const contents = await fetchApplianceContents(credentials, 'A', 'fr-FR', { fetch });
  assert.equal(contents.config.subPrograms[0].enumValues[0].strKey, '12', 'integer labels');
  assert.deepEqual(contents.localization, { program_cottons: 'Coton' });
  assert.match(calls[0].url, /applianceId=A&ctype=CONFIGURATION%2CLOCALIZATION&lang=fr-FR/);
});

test('Bluetooth-only appliances are recognized', () => {
  assert.equal(isBluetoothOnly({ connectivity: 'BT' }), true);
  assert.equal(isBluetoothOnly({ connectivity: 'BASICBT' }), true);
  assert.equal(isBluetoothOnly({}), true);
  assert.equal(isBluetoothOnly({ connectivity: 'WIFI' }), false);
});
