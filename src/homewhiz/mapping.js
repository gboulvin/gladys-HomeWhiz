// -----------------------------------------------------------------------------
// HomeWhiz controls -> Gladys features.
//
// Every control (see controls.js) becomes one or more Gladys features. Each
// entry of `buildFeatureMap` carries:
//   - key       : the feature key (part of the external id: NEVER rename);
//   - feature   : the Gladys payload, minus its external_id;
//   - read(data): the state to publish, `{ state: number }` or `{ text }`,
//                 or `null` when unknown;
//   - write(value, data) (writable features only): the HomeWhiz commands.
//
// Mapping:
//   writable choice (program, temperature, spin...) -> text/select, writable
//   read-only choice (phase, monitoring)           -> text/select, read only
//   on/off option (prewash, eco...)                -> switch/binary
//   read-only flag (warning, remote control)       -> switch/binary, read only
//   remaining / duration / delay                   -> duration/integer (minutes)
//   start delay setting                            -> duration/integer, writable
//   temperature reading                            -> temperature-sensor
//   temperature setting (fridge, oven)             -> thermostat/target-temperature
//   air conditioner                                -> air-conditioning/*
//   appliance state                                -> text/select + switch/binary "power"
//   active warnings                                -> text/text "warnings"
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { CONTROL_KINDS, boundedValuesOptions } from './controls.js';
import { featureLabel, optionLabel } from '../i18n/index.js';

const MAX_MINUTES = 24 * 60;

/** Feature key from a control key: external ids accept no `#`. */
export const featureKeyOf = (controlKey) => controlKey.replaceAll('#', '-');

const STATE = {
  ON: 'device_state_on',
  OFF: 'device_state_off',
  RUNNING: 'device_state_running',
  PAUSED: 'device_state_paused',
  DELAYED: 'device_state_time_delay_active',
};
export { STATE as APPLIANCE_STATES };

const isWarningKey = (key) => /(^|_)(warning|message)_/.test(key);
const isTemperature = (key) => key.includes('temp');

function base(name, extra) {
  // Every feature carries name, min, max, read_only and has_feedback: Gladys
  // stores them NOT NULL.
  return {
    name,
    min: 0,
    max: 0,
    read_only: true,
    has_feedback: false,
    keep_history: false,
    ...extra,
  };
}

function selectFeature(name, options, readOnly) {
  return base(name, {
    category: CATEGORIES.TEXT,
    type: TYPES.TEXT.SELECT,
    read_only: readOnly,
    has_feedback: !readOnly,
    supported_options: options.map(({ value, label }, index) => ({
      value,
      label,
      sort_order: index,
    })),
  });
}

function binaryFeature(name, readOnly, category = CATEGORIES.SWITCH) {
  return base(name, {
    category,
    type: category === CATEGORIES.SWITCH ? TYPES.SWITCH.BINARY : TYPES.AIR_CONDITIONING.BINARY,
    min: 0,
    max: 1,
    read_only: readOnly,
    has_feedback: !readOnly,
    keep_history: true,
  });
}

const textState = (value) =>
  value === null || value === undefined ? null : { text: String(value) };
const numberState = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? { state: value } : null;
const boolState = (value) => (typeof value === 'boolean' ? { state: value ? 1 : 0 } : null);

function choiceEntries(control, language, localization) {
  return [...control.options.values()].map((option) => ({
    value: option,
    label: optionLabel(control.key, option, language, localization),
  }));
}

function mapControl(control, language, localization) {
  const name = featureLabel(control.key, language, localization);
  const key = featureKeyOf(control.key);
  switch (control.kind) {
    case CONTROL_KINDS.WRITE_ENUM:
    case CONTROL_KINDS.ENUM: {
      const writable = control.kind === CONTROL_KINDS.WRITE_ENUM;
      const entries = [
        {
          key,
          feature: selectFeature(name, choiceEntries(control, language, localization), !writable),
          read: (data) => textState(control.getValue(data)),
          write: writable ? (value) => control.setValue(String(value)) : undefined,
        },
      ];
      // The appliance state also drives a plain on/off switch, the easiest
      // thing to use in a scene or on a dashboard.
      const options = [...control.options.values()];
      if (control.key === 'state' && options.includes(STATE.ON) && options.includes(STATE.OFF)) {
        entries.push({
          key: 'power',
          feature: binaryFeature(featureLabel('power', language), false),
          read: (data) => {
            const state = control.getValue(data);
            return state === null ? null : { state: state === STATE.OFF ? 0 : 1 };
          },
          write: (value) => control.setValue(Number(value) === 1 ? STATE.ON : STATE.OFF),
        });
      }
      return entries;
    }
    case CONTROL_KINDS.WRITE_BOOLEAN:
      return [
        {
          key,
          feature: binaryFeature(name, false),
          read: (data) => boolState(control.getValue(data)),
          write: (value) => control.setValue(Number(value) === 1),
        },
      ];
    case CONTROL_KINDS.BOOLEAN:
      return [
        {
          key,
          feature: binaryFeature(name, true),
          read: (data) => boolState(control.getValue(data)),
        },
      ];
    case CONTROL_KINDS.TIME:
    case CONTROL_KINDS.WRITE_TIME: {
      const writable = control.kind === CONTROL_KINDS.WRITE_TIME;
      return [
        {
          key,
          feature: base(name, {
            category: CATEGORIES.DURATION,
            type: TYPES.DURATION.INTEGER,
            unit: UNITS.MINUTES,
            max: MAX_MINUTES,
            read_only: !writable,
            has_feedback: writable,
            keep_history: !writable,
          }),
          read: (data) => numberState(control.getValue(data)),
          write: writable ? (value) => control.setValue(value) : undefined,
        },
      ];
    }
    case CONTROL_KINDS.NUMERIC:
      return [mapNumericReading(control, key, name)];
    case CONTROL_KINDS.WRITE_NUMERIC:
      return [mapNumericSetting(control, key, name, language, localization)];
    case CONTROL_KINDS.CLIMATE:
      return mapClimate(control, language, localization);
    default:
      return [];
  }
}

function mapNumericReading(control, key, name) {
  const { bounds } = control;
  const range = { min: bounds.lowerLimit ?? 0, max: bounds.upperLimit ?? 0 };
  if (isTemperature(control.key)) {
    return {
      key,
      feature: base(name, {
        category: CATEGORIES.TEMPERATURE_SENSOR,
        type: TYPES.SENSOR.DECIMAL,
        unit: UNITS.CELSIUS,
        ...range,
        keep_history: true,
      }),
      read: (data) => numberState(control.getValue(data)),
    };
  }
  if (control.key.includes('consumption') && bounds.unit === 'hw') {
    return {
      key,
      feature: base(name, {
        category: CATEGORIES.ENERGY_SENSOR,
        type: TYPES.ENERGY_SENSOR.POWER,
        unit: UNITS.KILOWATT,
        min: 0,
        max: Math.max(1, (bounds.upperLimit ?? 0) * (bounds.factor || 1)),
        keep_history: true,
      }),
      read: (data) => numberState(control.getValue(data)),
    };
  }
  // No Gladys category for an arbitrary appliance reading: show it as text.
  const unit = bounds.unit && bounds.unit !== 'hw' ? ` ${bounds.unit}` : '';
  return {
    key,
    feature: base(name, { category: CATEGORIES.TEXT, type: TYPES.TEXT.TEXT }),
    read: (data) => textState(`${control.getValue(data)}${unit}`),
  };
}

function mapNumericSetting(control, key, name, language, localization) {
  const { bounds } = control;
  if (isTemperature(control.key)) {
    return {
      key,
      feature: base(name, {
        category: CATEGORIES.THERMOSTAT,
        type: TYPES.THERMOSTAT.TARGET_TEMPERATURE,
        unit: UNITS.CELSIUS,
        min: bounds.lowerLimit,
        max: bounds.upperLimit,
        read_only: false,
        has_feedback: true,
        keep_history: true,
      }),
      read: (data) => numberState(control.getValue(data)),
      write: (value) => control.setValue(Number(value)),
    };
  }
  // A small range (brightness 1-4, heater level 0-9): a list of choices.
  const options = boundedValuesOptions(control.key, bounds);
  const byName = new Map([...options].map(([byte, option]) => [option, byte]));
  return {
    key,
    feature: selectFeature(
      name,
      [...options.values()].map((option) => ({
        value: option,
        label: optionLabel(control.key, option, language, localization),
      })),
      false,
    ),
    read: (data) => {
      const value = control.getValue(data);
      const byte = Math.trunc(value / bounds.factor);
      return textState(options.get(byte) ?? null);
    },
    write: (value) => {
      const byte = byName.get(String(value));
      if (byte === undefined) {
        throw new Error(`Unknown option "${value}" for ${control.key}`);
      }
      return control.setValue(byte * bounds.factor);
    },
  };
}

function mapClimate(climate, language, localization) {
  const label = (key) => featureLabel(key, language, localization);
  const target = climate.targetTemperature.bounds;
  const entries = [
    {
      key: 'ac-power',
      feature: binaryFeature(label('air_conditioner'), false, CATEGORIES.AIR_CONDITIONING),
      read: (data) => boolState(climate.power.getValue(data)),
      write: (value) => climate.power.setValue(Number(value) === 1),
    },
    {
      key: 'ac-mode',
      feature: base(label('air_conditioner_mode'), {
        category: CATEGORIES.AIR_CONDITIONING,
        type: TYPES.AIR_CONDITIONING.MODE,
        min: 0,
        max: 4,
        read_only: false,
        has_feedback: true,
      }),
      read: (data) => numberState(climate.getMode(data)),
      write: (value) => climate.setMode(value),
    },
    {
      key: 'ac-target-temperature',
      feature: base(label('air_conditioner_target_temperature'), {
        category: CATEGORIES.AIR_CONDITIONING,
        type: TYPES.AIR_CONDITIONING.TARGET_TEMPERATURE,
        unit: UNITS.CELSIUS,
        min: target.lowerLimit,
        max: target.upperLimit,
        read_only: false,
        has_feedback: true,
        keep_history: true,
      }),
      read: (data) => numberState(climate.targetTemperature.getValue(data)),
      write: (value) => climate.targetTemperature.setValue(Number(value)),
    },
    {
      key: 'ac-room-temperature',
      feature: base(label('air_conditioner_room_temperature'), {
        category: CATEGORIES.TEMPERATURE_SENSOR,
        type: TYPES.SENSOR.DECIMAL,
        unit: UNITS.CELSIUS,
        min: -20,
        max: 60,
        keep_history: true,
      }),
      read: (data) => numberState(climate.roomTemperature.getValue(data)),
    },
  ];
  // Fan speed: the bytes the appliance knows, labeled.
  const fanOptions = [...climate.fanSpeed.options.entries()];
  if (fanOptions.length > 0) {
    const bytes = fanOptions.map(([byte]) => byte);
    entries.push({
      key: 'ac-fan-speed',
      feature: base(label('air_conditioner_wind_strength'), {
        category: CATEGORIES.AIR_CONDITIONING,
        type: TYPES.AIR_CONDITIONING.FAN_SPEED,
        min: Math.min(...bytes),
        max: Math.max(...bytes),
        read_only: false,
        has_feedback: true,
        supported_options: fanOptions.map(([byte, option], index) => ({
          value: byte,
          label: optionLabel('air_conditioner_wind_strength', option, language, localization),
          sort_order: index,
        })),
      }),
      read: (data) => {
        const option = climate.fanSpeed.getValue(data);
        const entry = fanOptions.find(([, name]) => name === option);
        return entry ? { state: entry[0] } : null;
      },
      write: (value) => {
        const option = climate.fanSpeed.options.get(Number(value));
        if (option === undefined) throw new Error(`Unknown fan speed ${value}`);
        return climate.fanSpeed.setValue(option);
      },
    });
  }
  for (const [axis, control] of [
    ['horizontal', climate.swingHorizontal],
    ['vertical', climate.swingVertical],
  ]) {
    if (!control) continue;
    entries.push({
      key: `ac-swing-${axis}`,
      feature: {
        ...binaryFeature(label(`swing_${axis}`), false, CATEGORIES.AIR_CONDITIONING),
        type:
          axis === 'horizontal'
            ? TYPES.AIR_CONDITIONING.SWING_HORIZONTAL
            : TYPES.AIR_CONDITIONING.SWING_VERTICAL,
      },
      read: (data) => boolState(control.getValue(data)),
      write: (value) => control.setValue(Number(value) === 1),
    });
  }
  if (climate.jetMode) {
    entries.push({
      key: 'air_conditioner_jet_mode',
      feature: binaryFeature(label('air_conditioner_jet_mode'), false),
      read: (data) => boolState(climate.jetMode.getValue(data)),
      write: (value) => climate.jetMode.setValue(Number(value) === 1),
    });
  }
  return entries;
}

/** Warning controls of an appliance (bitmask flags). */
export const warningControlsOf = (controls) =>
  controls.filter((control) => control.kind === CONTROL_KINDS.BOOLEAN && isWarningKey(control.key));

/**
 * Every Gladys feature of an appliance.
 * @param {Array<object>} controls - From generateControls.
 * @param {string} language - Language of the labels.
 * @param {object} [localization] - Cloud labels of the appliance.
 * @returns {Array<object>} `{ key, feature, read, write? }`, unique by key.
 */
export function buildFeatureMap(controls, language, localization = {}) {
  const entries = controls.flatMap((control) => mapControl(control, language, localization));
  const warnings = warningControlsOf(controls);
  if (warnings.length > 0) {
    entries.push({
      key: 'warnings',
      feature: base(featureLabel('warnings', language), {
        category: CATEGORIES.TEXT,
        type: TYPES.TEXT.TEXT,
      }),
      read: (data) =>
        textState(
          warnings
            .filter((warning) => warning.getValue(data))
            .map((warning) => featureLabel(warning.key, language, localization))
            .join(', '),
        ),
    });
  }
  const unique = new Map();
  for (const entry of entries) {
    if (!unique.has(entry.key)) unique.set(entry.key, entry);
  }
  return [...unique.values()];
}
