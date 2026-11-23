// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+), declared in the manifest `widgets` field.
//
//   appliances_overview  every appliance of the account: state, program,
//                        phase, time left, warnings;
//   appliance_status     one appliance (chosen per widget instance): time
//                        left, progress, details and start / pause / off
//                        buttons.
//
// The content is declarative (the core renders it with its own theme): see
// the SDK README. The core caches it until `ttl_seconds`; the service nudges
// the widgets when an appliance changes (refreshWidgets, throttled).
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { APPLIANCE_STATES } from './homewhiz/mapping.js';
import { COMMANDS } from './homewhiz/service.js';
import { normalizeLanguage, pick } from './i18n/index.js';

const logger = createLogger({ name: 'widgets' });

export const WIDGET_KEYS = {
  OVERVIEW: 'appliances_overview',
  STATUS: 'appliance_status',
};

const TEXT = {
  noAppliance: {
    en: 'No HomeWhiz appliance yet: check the configuration of the integration.',
    fr: 'Aucun appareil HomeWhiz pour l’instant : vérifiez la configuration de l’intégration.',
    de: 'Noch kein HomeWhiz-Gerät: Prüfen Sie die Konfiguration der Integration.',
    es: 'Aún no hay electrodomésticos HomeWhiz: revise la configuración de la integración.',
  },
  unknownAppliance: {
    en: 'Choose an appliance in the settings of this widget.',
    fr: 'Choisissez un appareil dans les réglages de ce widget.',
    de: 'Wählen Sie in den Einstellungen dieses Widgets ein Gerät.',
    es: 'Elija un electrodoméstico en los ajustes de este widget.',
  },
  waiting: { en: 'Waiting', fr: 'En attente', de: 'Wartet', es: 'En espera' },
  remaining: { en: 'Time left', fr: 'Temps restant', de: 'Restzeit', es: 'Tiempo restante' },
  progress: { en: 'Progress', fr: 'Progression', de: 'Fortschritt', es: 'Progreso' },
  state: { en: 'State', fr: 'État', de: 'Zustand', es: 'Estado' },
  program: { en: 'Program', fr: 'Programme', de: 'Programm', es: 'Programa' },
  phase: { en: 'Phase', fr: 'Phase', de: 'Phase', es: 'Fase' },
  warnings: { en: 'Warnings', fr: 'Alertes', de: 'Warnungen', es: 'Avisos' },
  none: { en: 'None', fr: 'Aucune', de: 'Keine', es: 'Ninguno' },
  remote: {
    en: 'Remote control',
    fr: 'Contrôle à distance',
    de: 'Fernsteuerung',
    es: 'Control remoto',
  },
  enabled: { en: 'Enabled', fr: 'Activé', de: 'Aktiviert', es: 'Activado' },
  disabled: {
    en: 'Disabled on the appliance',
    fr: 'Désactivé sur l’appareil',
    de: 'Am Gerät deaktiviert',
    es: 'Desactivado en el aparato',
  },
  left: { en: 'left', fr: 'restant', de: 'übrig', es: 'restante' },
  start: { en: 'Start', fr: 'Démarrer', de: 'Starten', es: 'Iniciar' },
  resume: { en: 'Resume', fr: 'Reprendre', de: 'Fortsetzen', es: 'Reanudar' },
  pause: { en: 'Pause', fr: 'Pause', de: 'Pause', es: 'Pausa' },
  powerOff: { en: 'Switch off', fr: 'Éteindre', de: 'Ausschalten', es: 'Apagar' },
  done: {
    en: 'Command sent.',
    fr: 'Commande envoyée.',
    de: 'Befehl gesendet.',
    es: 'Orden enviada.',
  },
  refused: {
    remote_control_disabled: {
      en: 'Enable remote control on the appliance first.',
      fr: 'Activez d’abord le contrôle à distance sur l’appareil.',
      de: 'Aktivieren Sie zuerst die Fernsteuerung am Gerät.',
      es: 'Active primero el control remoto en el aparato.',
    },
    default: {
      en: 'This appliance cannot do that.',
      fr: 'Cet appareil ne sait pas faire cela.',
      de: 'Dieses Gerät kann das nicht.',
      es: 'Este aparato no puede hacerlo.',
    },
  },
};

const STATE_COLORS = {
  [APPLIANCE_STATES.RUNNING]: WIDGET_COLORS.SUCCESS,
  [APPLIANCE_STATES.PAUSED]: WIDGET_COLORS.WARNING,
  [APPLIANCE_STATES.DELAYED]: WIDGET_COLORS.INFO,
  [APPLIANCE_STATES.ON]: WIDGET_COLORS.PRIMARY,
  [APPLIANCE_STATES.OFF]: WIDGET_COLORS.NEUTRAL,
};

const truncate = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** 57 -> "57 min", 137 -> "2 h 17". */
export function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

function statusOf(service, appliance, language) {
  return appliance.data ? service.statusOf(appliance, language) : null;
}

function overviewItem(service, appliance, language) {
  const status = statusOf(service, appliance, language);
  const name = service.applianceName(appliance);
  if (!status) {
    return {
      title: truncate(name, 60),
      badge: { text: truncate(pick(TEXT.waiting, language), 16), color: WIDGET_COLORS.NEUTRAL },
    };
  }
  const details = [
    status.subStateLabel,
    status.active && status.remaining
      ? `${formatMinutes(status.remaining)} ${pick(TEXT.left, language)}`
      : null,
  ].filter(Boolean);
  const item = {
    title: truncate(name, 60),
    subtitle: truncate([status.programLabel, ...details].filter(Boolean).join(' · ') || '-', 80),
    badge: {
      text: truncate(status.stateLabel ?? '-', 16),
      color: status.warnings.length
        ? WIDGET_COLORS.DANGER
        : (STATE_COLORS[status.state] ?? WIDGET_COLORS.NEUTRAL),
    },
  };
  if (status.warningLabels.length) {
    item.description = truncate(
      `${pick(TEXT.warnings, language)}${language === 'fr' ? ' :' : ':'} ${status.warningLabels.join(', ')}`,
      2000,
    );
  }
  return item;
}

/**
 * @param {Function} getService - Returns the running HomeWhizService.
 */
export function createWidgets(getService) {
  return {
    [WIDGET_KEYS.OVERVIEW]: {
      async get(_gladys, { language }) {
        const lang = normalizeLanguage(language);
        const service = getService();
        const appliances = [...service.appliances.values()];
        logger.debug(`onWidgetGet <- ${WIDGET_KEYS.OVERVIEW}`);
        if (appliances.length === 0) {
          return {
            ttl_seconds: 300,
            components: [{ type: 'text', variant: 'body', text: pick(TEXT.noAppliance, lang) }],
          };
        }
        return {
          ttl_seconds: 120,
          components: [
            {
              type: 'card-list',
              display: 'list',
              items: appliances
                .slice(0, 8)
                .map((appliance) => overviewItem(service, appliance, lang)),
            },
          ],
        };
      },
    },

    [WIDGET_KEYS.STATUS]: {
      async get(_gladys, { settings, language }) {
        const lang = normalizeLanguage(language);
        const service = getService();
        const appliance = service.applianceByExternalId(settings?.device);
        if (!appliance) {
          return {
            ttl_seconds: 300,
            components: [
              { type: 'text', variant: 'body', text: pick(TEXT.unknownAppliance, lang) },
            ],
          };
        }
        const name = service.applianceName(appliance);
        const status = statusOf(service, appliance, lang);
        const components = [{ type: 'text', variant: 'heading', text: truncate(name, 40) }];
        if (!status) {
          components.push({ type: 'text', variant: 'caption', text: pick(TEXT.waiting, lang) });
          return { ttl_seconds: 60, components };
        }
        if (status.remaining !== null) {
          components.push({
            type: 'value',
            label: pick(TEXT.remaining, lang),
            icon: 'clock',
            value: status.active ? status.remaining : 0,
            unit: 'min',
          });
        }
        if (status.active && status.duration && status.remaining !== null) {
          const done = Math.round(((status.duration - status.remaining) / status.duration) * 100);
          components.push({
            type: 'gauge',
            label: pick(TEXT.progress, lang),
            value: Math.min(100, Math.max(0, done)),
            min: 0,
            max: 100,
            unit: '%',
            color: WIDGET_COLORS.PRIMARY,
          });
        }
        const items = [
          {
            label: pick(TEXT.state, lang),
            icon: 'power',
            value: truncate(status.stateLabel ?? '-', 40),
            color: STATE_COLORS[status.state] ?? WIDGET_COLORS.NEUTRAL,
          },
        ];
        if (status.programLabel) {
          items.push({
            label: pick(TEXT.program, lang),
            icon: 'list',
            value: truncate(status.programLabel, 40),
            color: WIDGET_COLORS.NEUTRAL,
          });
        }
        if (status.subStateLabel) {
          items.push({
            label: pick(TEXT.phase, lang),
            icon: 'activity',
            value: truncate(status.subStateLabel, 40),
            color: WIDGET_COLORS.INFO,
          });
        }
        if (status.remoteControl !== null) {
          items.push({
            label: pick(TEXT.remote, lang),
            icon: 'smartphone',
            value: pick(status.remoteControl ? TEXT.enabled : TEXT.disabled, lang),
            color: status.remoteControl ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
          });
        }
        items.push({
          label: pick(TEXT.warnings, lang),
          icon: 'alert-triangle',
          value: truncate(status.warningLabels.join(', ') || pick(TEXT.none, lang), 40),
          color: status.warnings.length ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
        });
        components.push({ type: 'status', items });

        // `params` are declared here and sent back as-is: never user input.
        const device = settings.device;
        if (status.state === APPLIANCE_STATES.RUNNING) {
          components.push(button(TEXT.pause, 'pause', 'secondary', COMMANDS.PAUSE, device, lang));
        } else if (status.state === APPLIANCE_STATES.PAUSED) {
          components.push(button(TEXT.resume, 'play', 'primary', COMMANDS.RESUME, device, lang));
        } else if (status.state === APPLIANCE_STATES.ON) {
          components.push(button(TEXT.start, 'play', 'primary', COMMANDS.START, device, lang));
        }
        if (status.state && status.state !== APPLIANCE_STATES.OFF) {
          components.push({
            ...button(TEXT.powerOff, 'power', 'danger', COMMANDS.POWER_OFF, device, lang),
            action: { key: COMMANDS.POWER_OFF, params: { device }, confirm: true },
          });
        }
        return { ttl_seconds: 60, components };
      },

      async action(_gladys, { actionKey, params }) {
        logger.info(`onWidgetAction <- ${WIDGET_KEYS.STATUS}.${actionKey}`);
        if (!Object.values(COMMANDS).includes(actionKey)) {
          throw new Error(`Unknown widget action: ${actionKey}`);
        }
        const result = await getService().runCommand(params.device, actionKey);
        if (result.ok) return TEXT.done;
        return TEXT.refused[result.reason] ?? TEXT.refused.default;
      },
    },
  };
}

function button(label, icon, style, command, device, lang) {
  return {
    type: 'button',
    label: pick(label, lang),
    icon,
    style,
    action: { key: command, params: { device } },
  };
}

/** Ask the core to re-pull every widget (throttled: at most every 15 s). */
export function createWidgetRefresher(gladys, widgets, minIntervalMs = 15_000) {
  let last = -Infinity;
  let timer = null;
  const refresh = () => {
    last = Date.now();
    timer = null;
    for (const key of Object.keys(widgets)) {
      gladys.requestWidgetRefresh(key);
    }
  };
  return function refreshWidgets({ now = false } = {}) {
    const wait = minIntervalMs - (Date.now() - last);
    if (now || wait <= 0) {
      clearTimeout(timer);
      refresh();
    } else if (!timer) {
      timer = setTimeout(refresh, wait);
      timer.unref?.();
    }
  };
}
