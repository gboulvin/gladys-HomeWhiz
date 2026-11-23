// -----------------------------------------------------------------------------
// Scene actions (Gladys 5.1+), declared in the manifest `scene_actions` field
// and registered by index.js with `gladys.onSceneAction(key, ...)`.
//
//   start_program      choose a program (optional), a start delay (optional),
//                      then start the appliance;
//   control_appliance  start / pause / resume / power on / power off.
//
// The fields arrive RESOLVED (scene variables substituted, the `device` field
// is the chosen device external_id). An appliance that cannot do it (remote
// control disabled on the appliance, unknown program...) is an OUTPUT, not a
// failure: the scene author gates the next actions on `success`. A network
// failure throws, which fails this action only.
//
// Scene TRIGGERS are fired by the service, see src/homewhiz/service.js.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { COMMANDS } from './homewhiz/service.js';

const logger = createLogger({ name: 'scenes' });

export const SCENE_ACTION_KEYS = {
  START_PROGRAM: 'start_program',
  CONTROL_APPLIANCE: 'control_appliance',
};

/**
 * @param {Function} getService - Returns the running HomeWhizService.
 */
export function createSceneActions(getService) {
  return {
    async [SCENE_ACTION_KEYS.START_PROGRAM](_gladys, { fields }) {
      logger.info(`Scene action start_program <- ${fields.device}`);
      const result = await getService().runCommand(fields.device, COMMANDS.START, {
        program: fields.program || undefined,
        delayMinutes: fields.delay_minutes,
      });
      return { success: result.ok, reason: result.reason ?? '' };
    },

    async [SCENE_ACTION_KEYS.CONTROL_APPLIANCE](_gladys, { fields }) {
      logger.info(`Scene action control_appliance ${fields.command} <- ${fields.device}`);
      const result = await getService().runCommand(fields.device, fields.command);
      return { success: result.ok, reason: result.reason ?? '' };
    },
  };
}
