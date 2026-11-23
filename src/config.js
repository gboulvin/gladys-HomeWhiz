// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module only provides the defaults
// and normalizes the received object, so the rest of the code never deals
// with `undefined`.
// -----------------------------------------------------------------------------

import { normalizeLanguage } from './i18n/index.js';

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  username: '',
  password: '',
  // Language of the device feature names and of the program lists.
  language: 'en',
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    username: String(raw.username ?? '').trim(),
    password: String(raw.password ?? ''),
    language: normalizeLanguage(raw.language ?? DEFAULT_CONFIG.language),
  };
}
