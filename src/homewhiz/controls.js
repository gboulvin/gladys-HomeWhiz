// -----------------------------------------------------------------------------
// HomeWhiz appliance controls.
//
// A HomeWhiz appliance reports its whole state as a byte array (the "wifi
// array", `wfa`). The appliance CONFIGURATION (downloaded once from the
// HomeWhiz content servers) says which byte means what: the program at byte
// 36, the spin speed at byte 38, a warning bitmask at byte 59...
//
// This module turns that configuration into a flat list of "controls", each
// one knowing how to read its value from the byte array and, when writable,
// which `[index, value]` command(s) change it. It is a port of
// `appliance_controls.py` of the Home Assistant HomeWhiz integration (MIT,
// https://github.com/home-assistant-HomeWhiz/home-assistant-HomeWhiz), so the
// two stay comparable: the keys (`washer_program`, `state`, `sub_state`...)
// and the values (`program_cottons`, `1200rpm`...) are the same.
//
// The controls are pure: no network, no Gladys. src/homewhiz/mapping.js maps
// them to Gladys features.
// -----------------------------------------------------------------------------

/** The appliances flag a "changed" byte with the high bit: strip it. */
export function clamp(value) {
  return value < 128 ? value : value - 128;
}

/** Read a byte, 0 when the array is shorter than the index. */
export function safeGet(data, index) {
  if (index === null || index === undefined || index >= data.length) {
    return 0;
  }
  return clamp(data[index]);
}

/** HomeWhiz string key -> stable snake_case key (`PROGRAM_COTTONS` -> `program_cottons`). */
export function toFriendlyName(name) {
  return String(name)
    .replaceAll('+', 'plus')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '')
    .replace(/_$/, '');
}

export const CONTROL_KINDS = {
  ENUM: 'enum', // read-only choice
  WRITE_ENUM: 'write-enum', // writable choice
  NUMERIC: 'numeric', // read-only number
  WRITE_NUMERIC: 'write-numeric', // writable number
  BOOLEAN: 'boolean', // read-only flag (compare or bitmask)
  WRITE_BOOLEAN: 'write-boolean', // writable on/off
  TIME: 'time', // read-only duration, in minutes
  WRITE_TIME: 'write-time', // writable duration (start delay), in minutes
  CLIMATE: 'climate', // air conditioner, several controls together
};

// --- Control factories --------------------------------------------------------
// Plain objects with a `kind`, a `key`, `getValue(data)` and, when writable,
// `setValue(value, currentData)` resolving a LIST of commands `{ index, value }`.

export function enumControl(key, readIndex, options) {
  return {
    kind: CONTROL_KINDS.ENUM,
    key,
    readIndex,
    options, // Map<byte, optionKey>
    getValue(data) {
      return options.get(safeGet(data, readIndex)) ?? null;
    },
  };
}

export function writeEnumControl(key, readIndex, writeIndex, options, extra = {}) {
  return {
    ...enumControl(key, readIndex, options),
    kind: CONTROL_KINDS.WRITE_ENUM,
    writeIndex,
    setValue(value) {
      const byte = byteOfOption(options, value);
      if (byte === undefined) {
        throw new Error(`Unknown option "${value}" for ${key}`);
      }
      // Hob zones: choosing a predefined program also switches the zone mode.
      const prefix =
        extra.modeWriteIndex !== undefined
          ? [{ index: extra.modeWriteIndex, value: extra.modeValue }]
          : [];
      return [...prefix, { index: writeIndex, value: byte }];
    },
  };
}

function byteOfOption(options, value) {
  for (const [byte, optionKey] of options) {
    if (optionKey === value) {
      return byte;
    }
  }
  return undefined;
}

export function numericControl(key, readIndex, bounds) {
  return {
    kind: CONTROL_KINDS.NUMERIC,
    key,
    readIndex,
    bounds,
    getValue(data) {
      return roundFactor(safeGet(data, readIndex) * bounds.factor);
    },
  };
}

export function writeNumericControl(key, readIndex, writeIndex, bounds, extra = {}) {
  return {
    ...numericControl(key, readIndex, bounds),
    kind: CONTROL_KINDS.WRITE_NUMERIC,
    writeIndex,
    setValue(value) {
      const prefix =
        extra.modeWriteIndex !== undefined
          ? [{ index: extra.modeWriteIndex, value: extra.modeValue }]
          : [];
      return [...prefix, { index: writeIndex, value: Math.trunc(Number(value) / bounds.factor) }];
    },
  };
}

// 0.1 factors would print 21.900000000000002.
function roundFactor(value) {
  return Math.round(value * 1000) / 1000;
}

export function booleanCompareControl(key, readIndex, compareValue) {
  return {
    kind: CONTROL_KINDS.BOOLEAN,
    key,
    readIndex,
    getValue(data) {
      return readIndex < data.length ? data[readIndex] === compareValue : false;
    },
  };
}

export function booleanBitmaskControl(key, readIndex, bit) {
  return {
    kind: CONTROL_KINDS.BOOLEAN,
    key,
    readIndex,
    bit,
    getValue(data) {
      return readIndex < data.length ? (data[readIndex] & (1 << bit)) !== 0 : false;
    },
  };
}

export function writeBooleanControl(key, readIndex, writeIndex, valueOn, valueOff) {
  return {
    kind: CONTROL_KINDS.WRITE_BOOLEAN,
    key,
    readIndex,
    writeIndex,
    valueOn,
    valueOff,
    getValue(data) {
      return readIndex < data.length ? clamp(data[readIndex]) === valueOn : false;
    },
    setValue(value) {
      return [{ index: writeIndex, value: value ? valueOn : valueOff }];
    },
  };
}

export function timeControl(key, hourIndex, minuteIndex) {
  return {
    kind: CONTROL_KINDS.TIME,
    key,
    hourIndex,
    minuteIndex,
    getValue(data) {
      const minutes = minuteIndex === null ? 0 : safeGet(data, minuteIndex);
      return safeGet(data, hourIndex) * 60 + minutes;
    },
  };
}

export function writeTimeControl(key, hourIndex, minuteIndex) {
  return {
    ...timeControl(key, hourIndex, minuteIndex),
    kind: CONTROL_KINDS.WRITE_TIME,
    setValue(value) {
      const minutes = Math.max(0, Math.trunc(Number(value)));
      const commands = [{ index: hourIndex, value: Math.floor(minutes / 60) }];
      if (minuteIndex !== null) {
        commands.push({ index: minuteIndex, value: minutes % 60 });
      }
      return commands;
    },
  };
}

/**
 * A remaining time reading 0 when the appliance is off (or, for a dryer, once
 * the program finished): the appliances keep the last value until then.
 */
function stateAwareRemaining(control, stateControl, subStateControl, finishedSubState) {
  return {
    ...control,
    getValue(data) {
      if (stateControl && stateControl.getValue(data) === 'device_state_off') {
        return 0;
      }
      if (
        subStateControl &&
        finishedSubState &&
        subStateControl.getValue(data) === finishedSubState
      ) {
        return 0;
      }
      return control.getValue(data);
    },
  };
}

// --- Options ------------------------------------------------------------------

function unitForKey(key) {
  if (key.includes('temp')) {
    return '°C';
  }
  if (key.includes('spin')) {
    return 'rpm';
  }
  return null;
}

/** Options generated from a numeric range: 20, 30... 90 °C, 400... 1400 rpm. */
export function boundedValuesOptions(key, bounds) {
  const result = new Map();
  if (!(bounds.step > 0) || !bounds.factor) {
    return result;
  }
  const unit = unitForKey(key);
  // Integer steps: count them instead of adding floats (0.1 + 0.2...).
  const count = Math.floor((bounds.upperLimit - bounds.lowerLimit) / bounds.step + 1e-9);
  for (let i = 0; i <= count; i += 1) {
    const value = roundFactor(bounds.lowerLimit + i * bounds.step);
    const wifiValue = Math.trunc(value / bounds.factor);
    const name = unit === null ? `${value}` : `${value}${unit}`;
    result.set(wifiValue, toFriendlyName(name));
  }
  return result;
}

function enumOptions(options) {
  const result = new Map();
  const used = new Set();
  for (const option of options ?? []) {
    if (option.wifiArrayValue === null || option.wifiArrayValue === undefined) {
      continue;
    }
    let name = toFriendlyName(option.strKey);
    if (used.has(name)) {
      name = `${name}_${option.wifiArrayValue}`;
    }
    used.add(name);
    result.set(option.wifiArrayValue, name);
  }
  return result;
}

/** Enum values first, the bounded ranges filling the gaps, sorted by byte. */
export function optionsFromFeature(key, feature) {
  const options = enumOptions(feature.enumValues);
  for (const bounds of feature.boundedValues ?? []) {
    for (const [byte, name] of boundedValuesOptions(key, bounds)) {
      if (!options.has(byte) && ![...options.values()].includes(name)) {
        options.set(byte, name);
      }
    }
  }
  return new Map([...options.entries()].sort((a, b) => a[0] - b[0]));
}

// --- Builders -------------------------------------------------------------------

const isSingleNumeric = (feature) =>
  !feature.enumValues && Array.isArray(feature.boundedValues) && feature.boundedValues.length === 1;

const writeIndexOf = (feature) => feature.wfaWriteIndex ?? feature.wifiArrayIndex;

function readControlFromFeature(feature) {
  if (!feature?.strKey) {
    return null;
  }
  const key = toFriendlyName(feature.strKey);
  if (isSingleNumeric(feature)) {
    return numericControl(key, feature.wifiArrayIndex, feature.boundedValues[0]);
  }
  return enumControl(key, feature.wifiArrayIndex, optionsFromFeature(key, feature));
}

function writeControlFromFeature(feature) {
  if (!feature?.strKey) {
    return null;
  }
  const key = toFriendlyName(feature.strKey);
  if (isSingleNumeric(feature)) {
    return writeNumericControl(
      key,
      feature.wifiArrayIndex,
      writeIndexOf(feature),
      feature.boundedValues[0],
    );
  }
  return writeEnumControl(
    key,
    feature.wifiArrayIndex,
    writeIndexOf(feature),
    optionsFromFeature(key, feature),
  );
}

function programControl(program) {
  if (!program) {
    return null;
  }
  return writeEnumControl(
    toFriendlyName(program.strKey),
    program.wifiArrayIndex,
    program.wfaWriteIndex ?? program.wifiArrayIndex,
    enumOptions(program.values),
  );
}

function stateControl(state) {
  if (!state) {
    return null;
  }
  const readIndex = state.wifiArrayReadIndex;
  const writeIndex = state.wifiArrayWriteIndex ?? state.wfaIndex;
  if (
    readIndex === null ||
    readIndex === undefined ||
    writeIndex === null ||
    writeIndex === undefined
  ) {
    return null;
  }
  return writeEnumControl('state', readIndex, writeIndex, enumOptions(state.states));
}

function subStateControl(subStates) {
  if (!subStates) {
    return null;
  }
  return enumControl('sub_state', subStates.wifiArrayReadIndex, enumOptions(subStates.subStates));
}

const PROGRESS_FIELDS = [
  'autoOff',
  'autoOn',
  'delay',
  'duration',
  'elapsed',
  'fermentedremaining',
  'remaining',
  'remainingOrElapsed',
];

function progressControls(progress, context) {
  if (!progress) {
    return [];
  }
  const results = [];
  let delayCount = 0;
  for (const field of PROGRESS_FIELDS) {
    const feature = progress[field];
    if (!feature?.hour) {
      continue;
    }
    let key = toFriendlyName(feature.strKey);
    const hourIndex = feature.hour.wifiArrayIndex;
    const minuteIndex = feature.minute ? feature.minute.wifiArrayIndex : null;
    if (feature.isCalculatedToStart !== null && feature.isCalculatedToStart !== undefined) {
      // The start delay: also writable, so a scene can program a delayed start.
      key = `delay_start#${delayCount}`;
      delayCount += 1;
      results.push(
        writeTimeControl(key.replace('delay_start', 'delay_start_set'), hourIndex, minuteIndex),
      );
    }
    let control = timeControl(key, hourIndex, minuteIndex);
    if (context.stateAwareKeys.includes(key) && context.state) {
      control = stateAwareRemaining(
        control,
        context.state,
        context.subState,
        context.finishedSubStates[key],
      );
    }
    results.push(control);
  }
  return results;
}

function remoteControl(remote) {
  if (!remote) {
    return null;
  }
  return booleanCompareControl('remote_control', remote.wifiArrayReadIndex, remote.wifiArrayValue);
}

function warningControls(warnings) {
  if (!warnings) {
    return [];
  }
  return warnings.warnings.map((warning) =>
    booleanBitmaskControl(
      toFriendlyName(warning.strKey),
      warnings.wifiArrayReadIndex,
      warning.bitIndex,
    ),
  );
}

function hobZoneControls(zones) {
  if (!zones?.defaultZone) {
    return [];
  }
  const zone = zones.defaultZone;
  const results = [];
  let manualMode = 1;
  let predefinedMode = 2;
  for (const option of zone.program?.values ?? []) {
    if (option.strKey === 'HOB_PROGRAM_MANUAL') manualMode = option.wifiArrayValue;
    if (option.strKey === 'HOB_PROGRAM_PREDEFINED') predefinedMode = option.wifiArrayValue;
  }
  for (let zoneIndex = 0; zoneIndex < zones.numberOfZones; zoneIndex += 1) {
    // The indices of the default zone are absolute for zone 1.
    const offset = zoneIndex * zones.eachZoneWifiArraySegmentLength;
    const prefix = `zone_${zoneIndex + 1}`;
    let programWrite;
    if (zone.program) {
      const read = zone.program.wifiArrayIndex + offset;
      programWrite =
        zone.program.wfaWriteIndex != null ? zone.program.wfaWriteIndex + offset : read;
      results.push(
        writeEnumControl(`${prefix}_program`, read, programWrite, enumOptions(zone.program.values)),
      );
    }
    for (const sub of zone.subPrograms ?? []) {
      if (!sub.strKey) continue;
      const key = `${prefix}_${toFriendlyName(sub.strKey)}`;
      const read = sub.wifiArrayIndex + offset;
      const write = sub.wfaWriteIndex != null ? sub.wfaWriteIndex + offset : read;
      const modeSwitch = (modeValue) =>
        programWrite !== undefined ? { modeWriteIndex: programWrite, modeValue } : {};
      if (sub.boundedValues?.length === 1) {
        results.push(
          writeNumericControl(key, read, write, sub.boundedValues[0], modeSwitch(manualMode)),
        );
      } else if (sub.enumValues?.length) {
        const extra = sub.strKey === 'HOB_PREDEFINED_PROGRAM' ? modeSwitch(predefinedMode) : {};
        results.push(writeEnumControl(key, read, write, enumOptions(sub.enumValues), extra));
      }
    }
    for (const monitoring of zone.monitorings ?? []) {
      if (!monitoring.strKey || !monitoring.enumValues?.length) continue;
      results.push(
        enumControl(
          `${prefix}_${toFriendlyName(monitoring.strKey)}`,
          monitoring.wifiArrayIndex + offset,
          enumOptions(monitoring.enumValues),
        ),
      );
    }
    const cookingRead = zone.cookingStates?.wifiArrayReadIndex;
    if (cookingRead !== null && cookingRead !== undefined) {
      results.push(
        enumControl(
          `${prefix}_cooking_state`,
          cookingRead + offset,
          enumOptions(zone.cookingStates.states),
        ),
      );
    }
    const duration = zone.progressVariables?.duration;
    if (duration) {
      results.push(
        timeControl(
          `${prefix}_duration`,
          duration.hour.wifiArrayIndex + offset,
          duration.minute.wifiArrayIndex + offset,
        ),
      );
    }
    const remaining = zone.progressVariables?.remainingOrElapsed;
    if (remaining && remaining.isVisible === 1) {
      results.push(
        timeControl(
          `${prefix}_remaining_or_elapsed`,
          remaining.hour.wifiArrayIndex + offset,
          remaining.minute.wifiArrayIndex + offset,
        ),
      );
    }
    if (zone.deviceWarnings) {
      const read = zone.deviceWarnings.wifiArrayReadIndex + offset;
      for (const warning of zone.deviceWarnings.warnings) {
        results.push(
          booleanBitmaskControl(
            `${prefix}_${toFriendlyName(warning.strKey)}`,
            read,
            warning.bitIndex,
          ),
        );
      }
    }
  }
  return results;
}

/** A writable choice between `*_off` and `*_on` is a switch. */
function toBooleanIfPossible(control) {
  if (control.kind !== CONTROL_KINDS.WRITE_ENUM || control.options.size !== 2) {
    return control;
  }
  const entries = [...control.options.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const [[offByte, offKey], [onByte, onKey]] = entries;
  if (offKey.endsWith('_off') && onKey.endsWith('_on')) {
    return writeBooleanControl(control.key, control.readIndex, control.writeIndex, onByte, offByte);
  }
  return control;
}

// Air conditioner program suffix -> Gladys AC mode (AC_MODE of the Gladys core).
export const AC_MODES = { AUTO: 0, COOLING: 1, HEATING: 2, DRYING: 3, FAN: 4 };
const AC_PROGRAM_SUFFIX_TO_MODE = {
  cooling: AC_MODES.COOLING,
  auto: AC_MODES.AUTO,
  dry: AC_MODES.DRYING,
  dehumidification: AC_MODES.DRYING,
  heating: AC_MODES.HEATING,
  fan: AC_MODES.FAN,
};

function swingAxis(parent) {
  if (!parent) {
    return null;
  }
  const isBoolean = parent.kind === CONTROL_KINDS.WRITE_BOOLEAN;
  const optionWithSuffix = (suffix) =>
    isBoolean ? undefined : [...parent.options.values()].find((key) => key.endsWith(suffix));
  return {
    getValue(data) {
      const value = parent.getValue(data);
      if (typeof value === 'boolean') return value;
      return value !== null && !value.endsWith('_off');
    },
    setValue(on) {
      if (isBoolean) return parent.setValue(on);
      const option = optionWithSuffix(on ? '_auto' : '_off');
      if (option === undefined) {
        throw new Error(`Cannot change the swing of ${parent.key}`);
      }
      return parent.setValue(option);
    },
  };
}

/** Group the controls of an air conditioner into one climate control. */
function extractClimate(controls) {
  const byKey = new Map(controls.map((control) => [control.key, control]));
  const program = byKey.get('air_conditioner_program');
  const state = byKey.get('state');
  const target = byKey.get('air_conditioner_target_temperature');
  const room = byKey.get('air_conditioner_room_temperature');
  const fan = byKey.get('air_conditioner_wind_strength');
  if (!program || state?.kind !== CONTROL_KINDS.WRITE_BOOLEAN || !target || !room || !fan) {
    return controls;
  }
  // Some AC models report a wrong factor for their instant consumption (the
  // real value is byte * 0.1 kW, see the Home Assistant integration).
  const consumption = byKey.get('air_conditioner_instant_consumption');
  if (consumption?.kind === CONTROL_KINDS.NUMERIC && consumption.bounds.unit === 'hw') {
    if (consumption.bounds.factor === 1) {
      byKey.set(
        consumption.key,
        numericControl(consumption.key, consumption.readIndex, {
          ...consumption.bounds,
          factor: 0.1,
        }),
      );
    }
  }
  const jet = byKey.get('air_conditioner_jet_mode');
  const modeOf = (optionKey) => AC_PROGRAM_SUFFIX_TO_MODE[optionKey.split('_').at(-1)];
  const climate = {
    kind: CONTROL_KINDS.CLIMATE,
    key: 'ac',
    power: state,
    program,
    targetTemperature: target,
    roomTemperature: room,
    fanSpeed: fan,
    jetMode: jet?.kind === CONTROL_KINDS.WRITE_BOOLEAN ? jet : null,
    swingHorizontal: swingAxis(byKey.get('air_conditioner_left_right_vane_control')),
    swingVertical: swingAxis(byKey.get('air_conditioner_up_down_vane_control')),
    /** Gladys AC modes this appliance supports. */
    modes: [...new Set([...program.options.values()].map(modeOf).filter((m) => m !== undefined))],
    getMode(data) {
      const option = program.getValue(data);
      return option === null ? null : (modeOf(option) ?? null);
    },
    setMode(mode) {
      const option = [...program.options.values()].find((key) => modeOf(key) === Number(mode));
      if (option === undefined) {
        throw new Error(`Unsupported air conditioner mode ${mode}`);
      }
      return program.setValue(option);
    },
    getValue(data) {
      return {
        power: state.getValue(data),
        mode: this.getMode(data),
        target_temperature: target.getValue(data),
        room_temperature: room.getValue(data),
        fan_speed: fan.getValue(data),
      };
    },
  };
  const grouped = new Set([program, state, target, room, fan, climate.jetMode]);
  return [
    ...controls.filter((control) => !grouped.has(control)).map((c) => byKey.get(c.key) ?? c),
    climate,
  ];
}

/**
 * Build every control of an appliance from its HomeWhiz configuration.
 * @param {object} config - The appliance CONFIGURATION document.
 * @returns {Array<object>} The controls, unique by key.
 */
export function generateControls(config) {
  const state = stateControl(config.deviceStates);
  const program = programControl(config.program);
  const subState = subStateControl(config.deviceSubStates);

  // Dryers keep reporting the program duration as remaining time while off.
  const stateAwareKeys = ['washer_remaining'];
  const finishedSubStates = {};
  if (program?.key === 'dryer_program') {
    stateAwareKeys.push('variable_remaining');
    finishedSubStates.variable_remaining = 'dryer_message_program_finished';
  }

  const candidates = [
    state,
    program,
    subState,
    ...(config.subPrograms ?? []).map(writeControlFromFeature),
    ...(config.customSubPrograms ?? []).map(writeControlFromFeature),
    ...(config.monitorings ?? []).map(readControlFromFeature),
    ...progressControls(config.progressVariables, {
      state,
      subState,
      stateAwareKeys,
      finishedSubStates,
    }),
    remoteControl(config.remoteControl),
    ...warningControls(config.deviceWarnings),
    ...warningControls(config.warnings),
    ...(config.settings ?? []).map(writeControlFromFeature),
    ...hobZoneControls(config.zones),
  ]
    .filter(Boolean)
    .map(toBooleanIfPossible);

  const unique = new Map();
  for (const control of extractClimate(candidates)) {
    if (!unique.has(control.key)) {
      unique.set(control.key, control);
    }
  }
  return [...unique.values()];
}

/**
 * Raw shadow payload of the HomeWhiz cloud -> byte array, or null when the
 * message carries no `wfa` (a connection or metadata update).
 */
export function shadowPayloadToData(payload) {
  const message = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const reported = message?.state?.reported;
  if (!reported || !Array.isArray(reported.wfa)) {
    return null;
  }
  const offset = Number(reported.wfaStartOffset ?? 26) || 26;
  return Uint8Array.from([...new Array(offset).fill(0), ...reported.wfa]);
}
