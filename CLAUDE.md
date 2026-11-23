# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

The **HomeWhiz** external integration of Gladys Assistant: a Node.js service
(Node 22+, ESM, no build step) running in its own sandboxed Docker container.
It talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and to the HomeWhiz cloud (Arçelik IoT: REST API on `api.arcelikiot.com` /
`smarthome.arcelikiot.com`, MQTT on AWS IoT Core over a SigV4 pre-signed
WebSocket) to control Beko, Grundig, Arçelik, Blomberg, Bauknecht… appliances.
Runtime dependencies: the SDK and `mqtt`. Started from the official
JavaScript template.

**Cloud only.** Bluetooth-only appliances are listed, never created: the
container has no Bluetooth radio. Do not add a `local` transport without a real
local channel.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/service.test.js          # one file
node --test --test-name-pattern "cycle"   # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on
Node 22 and 24, and builds the Docker image: run the three commands before
pushing.

## Architecture

```
index.js                     SDK wiring only: handlers registered before connect()
src/homewhiz/api.js          REST: login (temporary AWS credentials), appliances, contents
src/homewhiz/sigv4.js        SigV4 signing: REST headers + pre-signed IoT WebSocket URL
src/homewhiz/cloud.js        MQTT client: shadow topics, force read, `[index,value]` writes,
                             credentials refreshed before they expire
src/homewhiz/controls.js     appliance CONFIGURATION -> controls reading the byte array
                             (port of the Home Assistant integration's appliance_controls.py)
src/homewhiz/mapping.js      controls -> Gladys features (+ read / write functions)
src/homewhiz/service.js      orchestration: discovery, states, scene events, commands
src/i18n/                    feature / option labels, en fr de es (labels.json from HA, MIT)
src/actions.js scenes.js widgets.js   manifest actions, scene actions, widgets
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
docs/{en,fr,de,es}.md        user documentation, re-hosted by Gladys (en + fr mandatory)
test/                        node --test against the SDK's fake Gladys; test/helpers.js holds
                             the fake HomeWhiz account and cloud. Fixtures come from HA (MIT)
```

## Rules

- **External ids are forever.** Devices are `gladys.externalIds('appliance',
applianceId)`, features `ids.feature(key)` where `key` is the control key of
  `controls.js` (`washer_program`, `state`, `delay_start_set-0`...) or a
  mapping key (`power`, `warnings`, `ac-mode`...). Renaming a control key, an
  option value (`program_cottons`) or a manifest key (config, actions, scene
  triggers/actions, widgets, their fields and outputs) orphans what users
  built on it. Keep the keys identical to the Home Assistant integration.
- **Every feature carries `name`, `min`, `max`, `read_only` and
  `has_feedback`**, even where they mean nothing (`0`/`0` for text). The fake
  Gladys of the SDK refuses a feature without them; `test/service.test.js`
  checks them.
- **Choices are `text`/`select`** with `supported_options` (value = option
  key, label = translated): states are published as `{ text }`. Air
  conditioners use the standard `air-conditioning` category (AC_MODE: 0 auto,
  1 cooling, 2 heating, 3 drying, 4 fan).
- **Secrets.** Never log the HomeWhiz password, the AWS credentials, the
  session token or a signed URL. The password is a manifest `secret` field.
- **The container rootfs is read-only.** Write only under `/data` (appliance
  configurations are cached there, see `fileStore`).
- **Tests never touch the network**: inject `fetch`, `login`, `connectMqtt`,
  `api`, `createCloud`, `store`.
- **Scene events**: one per transition (never per report), flat `data`, only
  keys declared in the trigger `fields` / `variables`. A scene action that the
  appliance cannot perform returns `{ success: false, reason }`; it throws only
  on a real failure (network).
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section.
- **Four languages.** Every user-facing text — manifest (`label`,
  `description`, `placeholder`, options), action and widget messages,
  connection statuses, `docs/*.md` — exists in **English, French, German and
  Spanish**, kept in sync. `test/manifest.test.js` walks the manifest for it.
  The catalog `description` holds 10 to 100 characters per language.
- **Manifest coupling.** `scene_triggers`, `scene_actions` and `widgets`
  require `gladys_version >= 5.1.0`. `test/manifest.test.js` ties the
  manifest to the code (defaults, actions, scene and widget handlers): change
  both sides together.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English.
