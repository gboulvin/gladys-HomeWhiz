// -----------------------------------------------------------------------------
// Entry point of the HomeWhiz integration for Gladys Assistant.
//
// Role of this file: wire the SDK to the HomeWhiz service. It holds no
// HomeWhiz logic (see src/homewhiz/), it only:
//   1. instantiates the SDK (connection, auth, reconnection: handled for you);
//   2. registers the event handlers BEFORE connect();
//   3. connects, then starts the service with the user's configuration.
//
// The SDK reads GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN and
// GLADYS_INTEGRATION_SELECTOR, injected by the Gladys supervisor.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './src/config.js';
import { HomeWhizService } from './src/homewhiz/service.js';
import { ACTIONS } from './src/actions.js';
import { createSceneActions } from './src/scenes.js';
import { createWidgetRefresher, createWidgets } from './src/widgets.js';

const gladys = new GladysIntegration();

let config = normalizeConfig();

const getService = () => service;
const widgets = createWidgets(getService);
const refreshWidgets = createWidgetRefresher(gladys, widgets);
const service = new HomeWhizService(gladys, { onAppliancesChanged: () => refreshWidgets() });
const sceneActions = createSceneActions(getService);

// Serialize the (re)starts: a config update during a start waits for it.
let starting = Promise.resolve();
function restart() {
  starting = starting
    .then(() => service.start(config))
    .then(() => refreshWidgets({ now: true }))
    .catch(async (err) => {
      logger.error('HomeWhiz start failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Connection to HomeWhiz failed, check the integration logs.',
          fr: 'La connexion à HomeWhiz a échoué, consultez les logs de l’intégration.',
          de: 'Verbindung zu HomeWhiz fehlgeschlagen, prüfen Sie die Protokolle.',
          es: 'La conexión con HomeWhiz ha fallado, revise los registros.',
        })
        .catch(() => {});
    });
  return starting;
}

// --- Discovery: Gladys asks for the list of devices --------------------------
gladys.onScanRequest(async () => {
  logger.info('onScanRequest -> publishing the HomeWhiz appliances');
  await gladys.publishDiscoveredDevices(service.buildDevices());
});

// --- Command: the user acts on a feature --------------------------------------
gladys.onSetValue(async (device, feature, value) => {
  logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
  await service.setValue(device.external_id, feature.external_id, value);
});

// --- Polling: once a minute, ask the appliance for a fresh report -------------
gladys.onPoll(async (device) => {
  await service.poll(device.external_id);
});

// --- Manifest actions: buttons of the Configuration screen ------------------
for (const [key, handler] of Object.entries(ACTIONS)) {
  gladys.onAction(key, (fields) => handler({ fields, config, service, restart }));
}

// --- Scene actions -------------------------------------------------------------
for (const [key, handler] of Object.entries(sceneActions)) {
  gladys.onSceneAction(key, (fields) => handler(gladys, { fields, config }));
}

// --- Dashboard widgets ---------------------------------------------------------
for (const [key, widget] of Object.entries(widgets)) {
  gladys.onWidgetGet(key, (request) => widget.get(gladys, { ...request, config }));
  if (typeof widget.action === 'function') {
    gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
      widget.action(gladys, { actionKey, params, settings, config }),
    );
  }
}

// --- Configuration updated by the user -----------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> restarting the HomeWhiz connection');
  config = normalizeConfig(newConfig);
  await restart();
});

// --- Connection lifecycle -------------------------------------------------------
gladys.on('connected', async () => {
  config = normalizeConfig(await gladys.getConfig());
  await restart();
});

// --- Graceful shutdown ------------------------------------------------------------
gladys.handleShutdown(async (signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  await service.stop();
});

logger.info('Starting the HomeWhiz integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
