// -----------------------------------------------------------------------------
// HomeWhiz cloud REST API (Arçelik IoT platform, the backend of the HomeWhiz
// mobile app): login, list of the account's appliances, appliance
// configuration and localized labels.
//
// Endpoints and payloads follow the Home Assistant HomeWhiz integration
// (api.py). Every function takes an optional `fetch` so the tests never touch
// the network. Never log the credentials or the tokens.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { signGetRequest } from './sigv4.js';

const logger = createLogger({ name: 'homewhiz-api' });

const API_HOST = 'api.arcelikiot.com';
const SMARTHOME_HOST = 'smarthome.arcelikiot.com';
const CONTENTS_URL = 'https://s3-eu-west-1.amazonaws.com/procam-contents';
const USER_AGENT = 'HomeWhiz/1.0';
const REQUEST_TIMEOUT_MS = 20_000;

export class LoginError extends Error {}
export class RequestError extends Error {}

/** Bluetooth-only appliances cannot be reached through the cloud. */
export function isBluetoothOnly(appliance) {
  return ['BT', 'BASICBT'].includes(appliance.connectivity ?? 'BT');
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError(`Unexpected non-JSON answer (HTTP ${response.status})`);
  }
}

/**
 * Sign in with the HomeWhiz account. Resolves temporary AWS credentials
 * `{ accessKey, secretKey, sessionToken, expiration }` (expiration in ms).
 */
export async function login(username, password, { fetch = globalThis.fetch } = {}) {
  const response = await fetch(`https://${API_HOST}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await readJson(response).catch(() => ({}));
  if (response.status !== 200 || body.success === false || !body.data?.credentials) {
    // The answer may echo account details: log its shape, not its content.
    logger.warn(`HomeWhiz login refused (HTTP ${response.status})`);
    throw new LoginError(body?.description ?? body?.message ?? `HTTP ${response.status}`);
  }
  return body.data.credentials;
}

async function signedGet(host, path, query, credentials, fetch) {
  const headers = signGetRequest({ host, path, query, credentials });
  const url = `https://${host}${path}${query ? `?${query}` : ''}`;
  const response = await fetch(url, {
    headers: { ...headers, Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await readJson(response);
  if (response.status !== 200 || body.success === false) {
    throw new RequestError(`${path} failed (HTTP ${response.status})`);
  }
  return body;
}

/** Every appliance of every home of the account. */
export async function fetchAppliances(credentials, { fetch = globalThis.fetch } = {}) {
  const homes = await signedGet(SMARTHOME_HOST, '/my-homes', '', credentials, fetch);
  const appliances = [];
  for (const home of homes.data ?? []) {
    const detail = await signedGet(SMARTHOME_HOST, `/my-homes/${home.id}`, '', credentials, fetch);
    appliances.push(...(detail.data?.appliances ?? []));
  }
  for (const appliance of appliances) {
    logger.debug(
      `Appliance ${appliance.applianceId}: type=${appliance.applianceType} brand=${appliance.brand} connectivity=${appliance.connectivity}`,
    );
  }
  return appliances;
}

async function fetchContent(content, fetch) {
  const url = `${CONTENTS_URL}/${content.ctype}S/${content.cid}/v${content.ver}/${content.cid}.${content.lang}.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new RequestError(
      `Content ${content.ctype} ${content.cid} unavailable (HTTP ${response.status})`,
    );
  }
  return readJson(response);
}

/**
 * Configuration (which byte means what) and localized labels of an appliance.
 * @param {object} credentials - From `login`.
 * @param {string} applianceId - HomeWhiz appliance id.
 * @param {string} language - HomeWhiz language code, e.g. `fr-FR`.
 */
export async function fetchApplianceContents(
  credentials,
  applianceId,
  language = 'en-GB',
  { fetch = globalThis.fetch } = {},
) {
  const query =
    `applianceId=${encodeURIComponent(applianceId)}` +
    `&ctype=CONFIGURATION%2CLOCALIZATION&lang=${encodeURIComponent(language)}&testMode=true`;
  const index = await signedGet(API_HOST, '/procam/contents', query, credentials, fetch);
  const results = index.data?.results ?? [];
  const configuration = results.find((content) => content.ctype === 'CONFIGURATION');
  if (!configuration) {
    throw new RequestError(`No configuration published for appliance ${applianceId}`);
  }
  const config = await fetchContent(configuration, fetch);
  // Some dryers use integers as sub-program labels.
  for (const subProgram of config.subPrograms ?? []) {
    for (const option of subProgram.enumValues ?? []) {
      if (typeof option.strKey === 'number') {
        option.strKey = String(option.strKey);
      }
    }
  }
  const localization = {};
  for (const content of results.filter((c) => c.ctype === 'LOCALIZATION')) {
    try {
      const document = await fetchContent(content, fetch);
      for (const [key, value] of Object.entries(document.localizations ?? {})) {
        localization[key.toLowerCase()] = value;
      }
    } catch (err) {
      // Labels are a comfort: the built-in translations take over.
      logger.warn(`Localization of ${applianceId} unavailable: ${err.message}`);
    }
  }
  return { config, localization };
}
