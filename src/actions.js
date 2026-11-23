// -----------------------------------------------------------------------------
// Buttons of the Configuration screen (manifest `actions`). The resolved
// message is displayed under the button.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { applianceType, brandName, APPLIANCE_TYPE_LABELS } from './homewhiz/constants.js';

const logger = createLogger({ name: 'actions' });

function describe(info) {
  const type = APPLIANCE_TYPE_LABELS[applianceType(info.applianceType)];
  return {
    en: `${brandName(info.brand)} ${type.en}`,
    fr: `${type.fr} ${brandName(info.brand)}`,
    de: `${brandName(info.brand)} ${type.de}`,
    es: `${type.es} ${brandName(info.brand)}`,
  };
}

const join = (infos, lang) => infos.map((info) => describe(info)[lang]).join(', ');

/** The test message: what the account holds, and what the integration can reach. */
export function connectionReport(service) {
  const reachable = [...service.appliances.values()].map((appliance) => appliance.info);
  const skipped = service.skipped;
  const message = {};
  const texts = {
    en: ['Connected.', 'Appliances over Wi-Fi', 'Bluetooth only, not supported', 'none'],
    fr: ['Connecté.', 'Appareils en Wi-Fi', 'Bluetooth uniquement, non pris en charge', 'aucun'],
    de: ['Verbunden.', 'WLAN-Geräte', 'Nur Bluetooth, nicht unterstützt', 'keine'],
    es: ['Conectado.', 'Electrodomésticos Wi-Fi', 'Solo Bluetooth, no compatible', 'ninguno'],
  };
  for (const [lang, [ok, wifi, bt, none]] of Object.entries(texts)) {
    const colon = lang === 'fr' ? ' :' : ':';
    let text = `${ok} ${wifi} (${reachable.length})${colon} ${join(reachable, lang) || none}.`;
    if (skipped.length) text += ` ${bt} (${skipped.length})${colon} ${join(skipped, lang)}.`;
    message[lang] = text;
  }
  return message;
}

export const ACTIONS = {
  /** Sign in again, reload the appliances, report what was found. */
  async test_connection({ config, service, restart }) {
    logger.info('Action test_connection');
    if (!config.username || !config.password) {
      return {
        en: 'Enter the e-mail and password of your HomeWhiz account first.',
        fr: 'Saisissez d’abord l’e-mail et le mot de passe de votre compte HomeWhiz.',
        de: 'Geben Sie zuerst E-Mail und Passwort Ihres HomeWhiz-Kontos ein.',
        es: 'Introduzca primero el correo y la contraseña de su cuenta HomeWhiz.',
      };
    }
    await restart();
    if (!service.cloud) {
      return {
        en: 'HomeWhiz sign-in failed: check the e-mail and the password.',
        fr: 'Connexion HomeWhiz refusée : vérifiez l’e-mail et le mot de passe.',
        de: 'HomeWhiz-Anmeldung fehlgeschlagen: E-Mail und Passwort prüfen.',
        es: 'Inicio de sesión HomeWhiz rechazado: revise el correo y la contraseña.',
      };
    }
    return connectionReport(service);
  },

  /** Download the appliance configurations again (new programs, new labels). */
  async refresh_appliances({ service }) {
    logger.info('Action refresh_appliances');
    const ok = await service.refreshAppliances();
    if (!ok) {
      return {
        en: 'Refresh failed: check the connection first.',
        fr: 'Échec de l’actualisation : vérifiez d’abord la connexion.',
        de: 'Aktualisierung fehlgeschlagen: Prüfen Sie zuerst die Verbindung.',
        es: 'Error al actualizar: compruebe primero la conexión.',
      };
    }
    return connectionReport(service);
  },
};
