// -----------------------------------------------------------------------------
// The HomeWhiz service: everything between the HomeWhiz cloud and Gladys.
//
//   start(config)   sign in, list the appliances, load their configuration
//                   (cached under /data), connect the real-time channel and
//                   publish the devices;
//   onData          an appliance reported its bytes: publish the changed
//                   states, fire the scene triggers, nudge the widgets;
//   setValue        a Gladys command -> HomeWhiz writes;
//   runCommand      the high-level operations of the scenes and widgets
//                   (start a program, pause, resume, power on/off).
//
// One instance lives in index.js; the tests build their own with fakes.
// -----------------------------------------------------------------------------

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger, DEVICE_POLL_FREQUENCIES } from '@gladysassistant/integration-sdk';
import * as defaultApi from './api.js';
import { HomeWhizCloud } from './cloud.js';
import { CONTROL_KINDS, generateControls } from './controls.js';
import { APPLIANCE_STATES, buildFeatureMap, featureKeyOf, warningControlsOf } from './mapping.js';
import {
  APPLIANCE_TYPE_LABELS,
  HOMEWHIZ_LANGUAGES,
  applianceType,
  brandName,
} from './constants.js';
import { featureLabel, normalizeLanguage, optionLabel } from '../i18n/index.js';

const logger = createLogger({ name: 'homewhiz' });

export const DEVICE_TYPE = 'appliance';
const STATES_HEARTBEAT_MS = 30 * 60 * 1000;

// Scene trigger keys, as declared in the manifest `scene_triggers` field.
export const SCENE_TRIGGERS = {
  CYCLE_STARTED: 'cycle_started',
  CYCLE_FINISHED: 'cycle_finished',
  WARNING_RAISED: 'warning_raised',
};

// High-level commands of the scene actions and widgets.
export const COMMANDS = {
  START: 'start',
  PAUSE: 'pause',
  RESUME: 'resume',
  POWER_ON: 'power_on',
  POWER_OFF: 'power_off',
};

const SIGN_IN_REFUSED = {
  en: 'HomeWhiz sign-in failed: check the e-mail and the password.',
  fr: 'Connexion HomeWhiz refusée : vérifiez l’e-mail et le mot de passe.',
  de: 'HomeWhiz-Anmeldung fehlgeschlagen: E-Mail und Passwort prüfen.',
  es: 'Inicio de sesión HomeWhiz rechazado: revise el correo y la contraseña.',
};

const ACTIVE_STATES = [APPLIANCE_STATES.RUNNING, APPLIANCE_STATES.PAUSED, APPLIANCE_STATES.DELAYED];

/** Minimal JSON file cache under /data (the only writable volume). */
export function fileStore(directory = process.env.HOMEWHIZ_DATA_DIR ?? '/data') {
  const path = (name) => join(directory, `${name.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`);
  return {
    async get(name) {
      try {
        return JSON.parse(await readFile(path(name), 'utf8'));
      } catch {
        return null;
      }
    },
    async set(name, value) {
      try {
        await mkdir(directory, { recursive: true });
        await writeFile(path(name), JSON.stringify(value));
      } catch (err) {
        logger.debug(`Cache write skipped: ${err.message}`);
      }
    },
  };
}

export class HomeWhizService {
  /**
   * @param {object} gladys - The SDK instance.
   * @param {object} [deps] - Injected for the tests.
   */
  constructor(
    gladys,
    { api = defaultApi, createCloud, store = fileStore(), onAppliancesChanged } = {},
  ) {
    this.gladys = gladys;
    this.api = api;
    this.createCloud = createCloud ?? ((options) => new HomeWhizCloud(options));
    this.store = store;
    this.onAppliancesChanged = onAppliancesChanged ?? (() => {});
    this.config = null;
    this.cloud = null;
    /** @type {Map<string, object>} applianceId -> appliance */
    this.appliances = new Map();
    /** Bluetooth-only appliances of the account (not reachable, listed only). */
    this.skipped = [];
    this.lastWidgetRefresh = 0;
  }

  get language() {
    return normalizeLanguage(this.config?.language);
  }

  // --- Lifecycle ---------------------------------------------------------------

  async start(config) {
    await this.stop();
    this.config = config;
    if (!config.username || !config.password) {
      await this.gladys.setConnectionStatus(false, {
        en: 'Enter the e-mail and password of your HomeWhiz account.',
        fr: 'Saisissez l’e-mail et le mot de passe de votre compte HomeWhiz.',
        de: 'Geben Sie die E-Mail-Adresse und das Passwort Ihres HomeWhiz-Kontos ein.',
        es: 'Introduzca el correo y la contraseña de su cuenta HomeWhiz.',
      });
      return false;
    }
    let credentials;
    try {
      credentials = await this.api.login(config.username, config.password);
    } catch (err) {
      logger.warn(`HomeWhiz sign-in failed: ${err.message}`);
      await this.gladys.setConnectionStatus(false, SIGN_IN_REFUSED);
      return false;
    }
    await this.loadAppliances(credentials);
    await this.gladys.publishDiscoveredDevices(this.buildDevices());

    const cloud = this.createCloud({ username: config.username, password: config.password });
    this.cloud = cloud;
    cloud.on('data', (applianceId, data) => {
      this.onData(applianceId, data).catch((err) =>
        logger.error(`State publication failed for ${applianceId}`, err),
      );
    });
    cloud.on('online', (applianceId, online) => {
      const appliance = this.appliances.get(applianceId);
      if (appliance) appliance.online = online;
    });
    cloud.on('connected', () => {
      this.gladys.setConnectionStatus(true).catch(() => {});
    });
    cloud.on('disconnected', () => {
      this.gladys
        .setConnectionStatus(false, {
          en: 'Connection to the HomeWhiz cloud lost, reconnecting…',
          fr: 'Connexion au cloud HomeWhiz perdue, reconnexion…',
          de: 'Verbindung zur HomeWhiz-Cloud verloren, Neuverbindung…',
          es: 'Conexión con la nube HomeWhiz perdida, reconectando…',
        })
        .catch(() => {});
    });
    cloud.on('auth-failed', () => {
      this.gladys.setConnectionStatus(false, SIGN_IN_REFUSED).catch(() => {});
    });
    await cloud.start([...this.appliances.keys()], credentials);
    return true;
  }

  async stop() {
    const cloud = this.cloud;
    this.cloud = null;
    if (cloud) {
      cloud.removeAllListeners();
      await cloud.stop().catch((err) => logger.debug(`Cloud stop: ${err.message}`));
    }
  }

  /** List the appliances and load their configuration (cache first). */
  async loadAppliances(credentials) {
    const infos = await this.api.fetchAppliances(credentials);
    const language = this.language;
    const previous = this.appliances;
    this.appliances = new Map();
    this.skipped = infos.filter((info) => this.api.isBluetoothOnly(info));
    for (const info of infos.filter((i) => !this.api.isBluetoothOnly(i))) {
      const id = info.applianceId;
      const cacheKey = `contents-${id}-${language}`;
      let contents = await this.store.get(cacheKey);
      if (!contents?.config) {
        try {
          contents = await this.api.fetchApplianceContents(
            credentials,
            id,
            HOMEWHIZ_LANGUAGES[language],
          );
          await this.store.set(cacheKey, contents);
        } catch (err) {
          logger.error(`Configuration of ${id} unavailable, appliance skipped: ${err.message}`);
          continue;
        }
      }
      const controls = generateControls(contents.config);
      this.appliances.set(id, {
        id,
        info,
        contents,
        controls,
        features: buildFeatureMap(controls, language, contents.localization),
        // Keep the last bytes across a restart of the service.
        data: previous.get(id)?.data ?? null,
        online: previous.get(id)?.online ?? null,
        status: previous.get(id)?.status ?? null,
      });
    }
    logger.info(
      `${this.appliances.size} HomeWhiz appliance(s) over Wi-Fi, ${this.skipped.length} Bluetooth-only skipped`,
    );
  }

  /** Forget the cached configurations and reload everything. */
  async refreshAppliances() {
    for (const id of this.appliances.keys()) {
      await this.store.set(`contents-${id}-${this.language}`, null);
    }
    return this.start(this.config);
  }

  // --- Devices -----------------------------------------------------------------

  ids(applianceId) {
    return this.gladys.externalIds(DEVICE_TYPE, applianceId);
  }

  applianceName(appliance) {
    const type = applianceType(appliance.info.applianceType);
    const brand = brandName(appliance.info.brand);
    const fallback = `${brand} ${APPLIANCE_TYPE_LABELS[type][this.language]}`;
    return appliance.info.name?.trim() || fallback;
  }

  buildDevices() {
    return [...this.appliances.values()].map((appliance) => {
      const ids = this.ids(appliance.id);
      const { info } = appliance;
      return {
        name: this.applianceName(appliance),
        external_id: ids.device,
        model: info.model ?? undefined,
        // Polled every minute: each poll asks the appliance for a fresh report.
        should_poll: true,
        poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
        params: [
          { name: 'BRAND', value: brandName(info.brand) },
          { name: 'APPLIANCE_TYPE', value: applianceType(info.applianceType) },
          { name: 'MODEL', value: String(info.model ?? '') },
        ],
        features: appliance.features.map(({ key, feature }) => ({
          ...feature,
          external_id: ids.feature(key),
        })),
      };
    });
  }

  /** The appliance owning a Gladys device external id. */
  applianceByExternalId(externalId) {
    for (const appliance of this.appliances.values()) {
      if (this.ids(appliance.id).device === externalId) return appliance;
    }
    return null;
  }

  // --- States ------------------------------------------------------------------

  async onData(applianceId, data) {
    const appliance = this.appliances.get(applianceId);
    if (!appliance) return;
    const before = appliance.data ? this.statusOf(appliance) : null;
    appliance.data = data;
    appliance.online = true;
    const ids = this.ids(applianceId);
    const states = [];
    for (const { key, read } of appliance.features) {
      const value = read(data);
      if (value) states.push({ device_feature_external_id: ids.feature(key), ...value });
    }
    // Unchanged values are not sent again (heartbeat every 30 minutes).
    for (let i = 0; i < states.length; i += 100) {
      await this.gladys.publishChangedStates(states.slice(i, i + 100), {
        heartbeat: STATES_HEARTBEAT_MS,
      });
    }
    const after = this.statusOf(appliance);
    appliance.status = after;
    if (before) {
      await this.fireSceneEvents(appliance, before, after);
    }
    if (!before || before.signature !== after.signature) {
      this.onAppliancesChanged();
    }
  }

  /** Re-read an appliance (Gladys poll). */
  async poll(externalId) {
    const appliance = this.applianceByExternalId(externalId);
    if (!appliance || !this.cloud) return false;
    await this.cloud.requestState(appliance.id);
    return true;
  }

  /** Summary of an appliance: what the widgets and scene triggers need. */
  statusOf(appliance, language = this.language) {
    const data = appliance.data;
    const byKey = new Map(appliance.controls.map((control) => [control.key, control]));
    const loc = appliance.contents.localization;
    const stateControl = byKey.get('state');
    const programControl = appliance.controls.find(
      (control) => control.key.endsWith('_program') && !control.key.startsWith('zone_'),
    );
    const timer = (pattern) =>
      appliance.controls.find(
        (control) => control.kind === CONTROL_KINDS.TIME && pattern.test(control.key),
      );
    const remainingControl = timer(/^(?!zone_).*(^|_)remaining$/);
    const durationControl = timer(/^(?!zone_).*(^|_)duration$/);
    const value = (control) => (control && data ? control.getValue(data) : null);
    const state = value(stateControl);
    const program = value(programControl);
    const subState = value(byKey.get('sub_state'));
    const warnings = data
      ? warningControlsOf(appliance.controls).filter((control) => control.getValue(data))
      : [];
    const remoteControl = byKey.get('remote_control');
    const remaining = value(remainingControl);
    const duration = value(durationControl);
    const status = {
      state,
      stateLabel: state ? optionLabel('state', state, language, loc) : null,
      program,
      programLabel:
        program && programControl ? optionLabel(programControl.key, program, language, loc) : null,
      subState,
      subStateLabel: subState ? optionLabel('sub_state', subState, language, loc) : null,
      remaining: typeof remaining === 'number' ? remaining : null,
      duration: typeof duration === 'number' ? duration : null,
      remoteControl: remoteControl && data ? remoteControl.getValue(data) : null,
      warnings: warnings.map((control) => control.key),
      warningLabels: warnings.map((control) => featureLabel(control.key, language, loc)),
      running: state === APPLIANCE_STATES.RUNNING,
      active: ACTIVE_STATES.includes(state),
    };
    status.signature = JSON.stringify([state, program, subState, remaining, status.warnings]);
    return status;
  }

  async fireSceneEvents(appliance, before, after) {
    const device = this.ids(appliance.id).device;
    const program = after.programLabel ?? before.programLabel ?? '';
    // One event per transition, never per report.
    if (after.running && !before.active) {
      await this.publishSceneEvent(SCENE_TRIGGERS.CYCLE_STARTED, { device, program });
    }
    const finishedSubState = (s) => /(finished|end_program|program_end)/.test(s ?? '');
    const stopped = before.running && after.state !== null && !after.active;
    const ended = !finishedSubState(before.subState) && finishedSubState(after.subState);
    if (stopped || ended) {
      await this.publishSceneEvent(SCENE_TRIGGERS.CYCLE_FINISHED, { device, program });
    }
    for (const [index, warning] of after.warnings.entries()) {
      if (!before.warnings.includes(warning)) {
        await this.publishSceneEvent(SCENE_TRIGGERS.WARNING_RAISED, {
          device,
          warning,
          warning_label: after.warningLabels[index],
        });
      }
    }
  }

  async publishSceneEvent(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Commands ----------------------------------------------------------------

  requireCloud() {
    if (!this.cloud) {
      throw new Error('Not connected to the HomeWhiz cloud');
    }
    return this.cloud;
  }

  /** A Gladys command on one feature. */
  async setValue(externalId, featureExternalId, value) {
    const appliance = this.applianceByExternalId(externalId);
    if (!appliance) throw new Error(`Unknown appliance ${externalId}`);
    const ids = this.ids(appliance.id);
    const entry = appliance.features.find(({ key }) => ids.feature(key) === featureExternalId);
    if (!entry?.write) throw new Error(`Feature ${featureExternalId} is read only`);
    const commands = entry.write(value, appliance.data ?? new Uint8Array());
    await this.requireCloud().sendCommands(appliance.id, commands);
  }

  /** Program options of an appliance, `[{ value, label }]`. */
  programOptions(appliance, language = this.language) {
    const control = appliance.controls.find(
      (c) => c.key.endsWith('_program') && !c.key.startsWith('zone_') && c.options,
    );
    if (!control) return [];
    return [...control.options.values()].map((option) => ({
      value: option,
      label: optionLabel(control.key, option, language, appliance.contents.localization),
    }));
  }

  /**
   * High-level operation on an appliance.
   * @returns {Promise<{ ok: boolean, reason?: string }>} `ok: false` + a
   *   reason when the appliance cannot do it (not a failure: scene authors
   *   gate on it).
   */
  async runCommand(externalId, command, { program, delayMinutes } = {}) {
    const appliance = this.applianceByExternalId(externalId);
    if (!appliance) return { ok: false, reason: 'unknown_device' };
    const byKey = new Map(appliance.controls.map((control) => [control.key, control]));
    const state = byKey.get('state');
    if (!state?.setValue) return { ok: false, reason: 'not_supported' };
    const has = (option) => [...state.options.values()].includes(option);
    const status = appliance.data ? this.statusOf(appliance) : null;
    const commands = [];
    switch (command) {
      case COMMANDS.POWER_ON:
      case COMMANDS.POWER_OFF: {
        const target = command === COMMANDS.POWER_ON ? APPLIANCE_STATES.ON : APPLIANCE_STATES.OFF;
        if (!has(target)) return { ok: false, reason: 'not_supported' };
        commands.push(...state.setValue(target));
        break;
      }
      case COMMANDS.PAUSE:
        if (!has(APPLIANCE_STATES.PAUSED)) return { ok: false, reason: 'not_supported' };
        commands.push(...state.setValue(APPLIANCE_STATES.PAUSED));
        break;
      case COMMANDS.RESUME:
      case COMMANDS.START: {
        if (!has(APPLIANCE_STATES.RUNNING)) return { ok: false, reason: 'not_supported' };
        if (status && status.remoteControl === false) {
          return { ok: false, reason: 'remote_control_disabled' };
        }
        if (command === COMMANDS.START && program) {
          const match = this.findProgram(appliance, program);
          if (!match) return { ok: false, reason: 'unknown_program' };
          commands.push(...match.control.setValue(match.option));
        }
        if (command === COMMANDS.START && Number(delayMinutes) > 0) {
          const delay = appliance.controls.find((c) => c.key.startsWith('delay_start_set'));
          if (!delay) return { ok: false, reason: 'delay_not_supported' };
          commands.push(...delay.setValue(Number(delayMinutes)));
        }
        commands.push(...state.setValue(APPLIANCE_STATES.RUNNING));
        break;
      }
      default:
        return { ok: false, reason: 'unknown_command' };
    }
    await this.requireCloud().sendCommands(appliance.id, commands);
    return { ok: true };
  }

  /** Find a program by key (`program_cottons`) or label (`Coton`), case-insensitive. */
  findProgram(appliance, wanted) {
    const control = appliance.controls.find(
      (c) => c.key.endsWith('_program') && !c.key.startsWith('zone_') && c.setValue,
    );
    if (!control) return null;
    const needle = String(wanted).trim().toLowerCase();
    for (const option of control.options.values()) {
      const labels = ['en', 'fr', 'de', 'es'].map((lang) =>
        optionLabel(control.key, option, lang, appliance.contents.localization).toLowerCase(),
      );
      if (option === needle || labels.includes(needle)) {
        return { control, option };
      }
    }
    return null;
  }
}

export { featureKeyOf };
