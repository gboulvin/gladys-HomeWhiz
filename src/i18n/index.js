// -----------------------------------------------------------------------------
// Labels of the appliance features and their options, in the 4 languages of
// the integration (en, fr, de, es).
//
// Lookup order for a key:
//   1. OVERRIDES below: the keys this integration adds (power, warnings...);
//   2. labels.json: translations of the Home Assistant HomeWhiz integration
//      (MIT), keyed exactly like our controls;
//   3. the localization the HomeWhiz cloud serves for the appliance, in the
//      language chosen in the configuration;
//   4. the English of labels.json, then the key itself, humanized.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const LABELS = JSON.parse(readFileSync(new URL('./labels.json', import.meta.url), 'utf8'));

export const LANGUAGES = ['en', 'fr', 'de', 'es'];
export const DEFAULT_LANGUAGE = 'en';

export const normalizeLanguage = (language) => {
  const short = String(language ?? '')
    .slice(0, 2)
    .toLowerCase();
  return LANGUAGES.includes(short) ? short : DEFAULT_LANGUAGE;
};

const OVERRIDES = {
  names: {
    power: { en: 'Power', fr: 'Marche / arrêt', de: 'Ein/Aus', es: 'Encendido' },
    state: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
    sub_state: { en: 'Phase', fr: 'Phase', de: 'Phase', es: 'Fase' },
    warnings: { en: 'Warnings', fr: 'Alertes', de: 'Warnungen', es: 'Avisos' },
    remote_control: {
      en: 'Remote control',
      fr: 'Contrôle à distance',
      de: 'Fernsteuerung',
      es: 'Control remoto',
    },
    delay_start: {
      en: 'Start delay',
      fr: 'Départ différé',
      de: 'Startverzögerung',
      es: 'Inicio diferido',
    },
    delay_start_set: {
      en: 'Start delay (setting)',
      fr: 'Départ différé (réglage)',
      de: 'Startverzögerung (Einstellung)',
      es: 'Inicio diferido (ajuste)',
    },
    air_conditioner: {
      en: 'Air conditioner',
      fr: 'Climatisation',
      de: 'Klimaanlage',
      es: 'Aire acondicionado',
    },
    air_conditioner_mode: { en: 'Mode', fr: 'Mode', de: 'Modus', es: 'Modo' },
    air_conditioner_target_temperature: {
      en: 'Target temperature',
      fr: 'Température de consigne',
      de: 'Solltemperatur',
      es: 'Temperatura objetivo',
    },
    air_conditioner_room_temperature: {
      en: 'Room temperature',
      fr: 'Température de la pièce',
      de: 'Raumtemperatur',
      es: 'Temperatura ambiente',
    },
    air_conditioner_wind_strength: {
      en: 'Fan speed',
      fr: 'Vitesse de ventilation',
      de: 'Lüftergeschwindigkeit',
      es: 'Velocidad del ventilador',
    },
    swing_horizontal: {
      en: 'Horizontal swing',
      fr: 'Oscillation horizontale',
      de: 'Horizontale Schwenkung',
      es: 'Oscilación horizontal',
    },
    swing_vertical: {
      en: 'Vertical swing',
      fr: 'Oscillation verticale',
      de: 'Vertikale Schwenkung',
      es: 'Oscilación vertical',
    },
    air_conditioner_jet_mode: {
      en: 'Jet mode',
      fr: 'Mode turbo',
      de: 'Turbomodus',
      es: 'Modo turbo',
    },
    zone: { en: 'Zone', fr: 'Zone', de: 'Zone', es: 'Zona' },
  },
  options: {
    state: {
      device_state_on: { en: 'On', fr: 'Allumé', de: 'Ein', es: 'Encendido' },
      device_state_off: { en: 'Off', fr: 'Éteint', de: 'Aus', es: 'Apagado' },
      device_state_running: { en: 'Running', fr: 'En cours', de: 'Läuft', es: 'En marcha' },
      device_state_paused: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
      device_state_time_delay_active: {
        en: 'Delayed start',
        fr: 'Départ différé',
        de: 'Startverzögerung',
        es: 'Inicio diferido',
      },
    },
  },
};

// A few upstream "translations" are the raw key (`PROGRAM_DELICATES`): skip them.
const usable = (text) =>
  typeof text === 'string' && !/^[A-Z0-9_]+$/.test(text) ? text : undefined;

const humanize = (key) => {
  const text = String(key).replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// `delay_start#0` -> `delay_start`, `zone_2_hob_heater_level` -> zone 2 + `hob_heater_level`.
function splitKey(key) {
  const base = String(key).replace(/#\d+$/, '');
  const zone = /^zone_(\d+)_(.+)$/.exec(base);
  return zone ? { zone: zone[1], base: zone[2] } : { zone: null, base };
}

/**
 * Name of a feature.
 * @param {string} key - Control key.
 * @param {string} language - en | fr | de | es.
 * @param {object} [localization] - HomeWhiz cloud labels of the appliance.
 */
export function featureLabel(key, language, localization = {}) {
  const lang = normalizeLanguage(language);
  const { zone, base } = splitKey(key);
  const label =
    OVERRIDES.names[base]?.[lang] ??
    usable(LABELS[lang]?.names?.[base]) ??
    usable(localization[base]) ??
    OVERRIDES.names[base]?.en ??
    usable(LABELS.en.names[base]) ??
    humanize(base);
  return zone ? `${OVERRIDES.names.zone[lang]} ${zone} - ${label}` : label;
}

/** Label of one option of a choice feature. */
export function optionLabel(key, option, language, localization = {}) {
  const lang = normalizeLanguage(language);
  const { base } = splitKey(key);
  return (
    OVERRIDES.options[base]?.[option]?.[lang] ??
    usable(LABELS[lang]?.options?.[base]?.[option]) ??
    usable(localization[option]) ??
    OVERRIDES.options[base]?.[option]?.en ??
    usable(LABELS.en.options?.[base]?.[option]) ??
    humanize(option)
  );
}

/** Pick the language of a multi-language object `{ en, fr, de, es }`. */
export const pick = (texts, language) => texts[normalizeLanguage(language)] ?? texts.en;
