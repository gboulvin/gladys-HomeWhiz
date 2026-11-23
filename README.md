# HomeWhiz for Gladys Assistant

[Gladys Assistant](https://gladysassistant.com) external integration for the
household appliances of the **HomeWhiz** app (Arçelik group): **Beko**,
**Grundig**, **Arçelik**, **Blomberg**, **Bauknecht**, **Elektrabregenz**,
**Altus**, **Arctic**, **Defy**, **Leisure**, **Flavel**, **Lamona**,
**Dawlance**, **Voltas Beko**, and the HomeWhiz models of Whirlpool, Smeg,
Teka, Viking, Cylinda and V-Zug.

- **Transport: cloud.** Wi-Fi appliances are reached through the HomeWhiz
  cloud (the same AWS IoT broker as the mobile app). Bluetooth-only
  appliances are not supported: the integration runs in a sandboxed container
  without a Bluetooth radio.
- **Languages**: English, French, German and Spanish (configuration, feature
  names, program lists, widgets, scene cards and documentation).
- **Requires** Gladys Assistant 5.1 or later.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Supported appliances

| Appliance                     | Monitoring                                           | Control                                         |
| ----------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| Washing machine, washer dryer | state, program, options, phase, times, warnings      | power, start/pause, program, options, delay     |
| Dryer                         | state, program, drying level, phase, times, warnings | power, start/pause, program, options, delay     |
| Dishwasher                    | state, program, phase, times, salt / rinse aid       | power, start/pause, program, options, delay     |
| Oven                          | state, program, temperature, times, door             | power, start/pause, program, temperature        |
| Hob                           | zones: program, heater level, cooking state, timers  | zone program, heater level                      |
| Refrigerator / freezer        | compartment temperatures, modes, door                | target temperatures, quick cool / freeze, modes |
| Air conditioner               | room temperature, mode, fan, swing                   | standard Gladys air conditioning card           |

The features are generated from the appliance's own HomeWhiz configuration,
so other models of these families work the same way.

## What it brings to Gladys

| Surface        | Key                                                 | What                                           |
| -------------- | --------------------------------------------------- | ---------------------------------------------- |
| Devices        | one per Wi-Fi appliance                             | features above, polled every minute + pushed   |
| Scene triggers | `cycle_started`, `cycle_finished`, `warning_raised` | with the program / warning as scene variables  |
| Scene actions  | `start_program`, `control_appliance`                | start (program, delay), pause, resume, on, off |
| Widgets        | `appliances_overview`, `appliance_status`           | every appliance at a glance / one appliance    |
| Actions        | `test_connection`, `refresh_appliances`             | Configuration screen buttons                   |

## Project structure

```
index.js                          SDK wiring only
src/homewhiz/api.js               HomeWhiz REST API: login, appliances, configuration
src/homewhiz/sigv4.js             AWS SigV4 signing (REST + pre-signed MQTT WebSocket)
src/homewhiz/cloud.js             real-time channel: AWS IoT MQTT over WebSocket
src/homewhiz/controls.js          appliance configuration -> byte-array controls
src/homewhiz/mapping.js           controls -> Gladys features
src/homewhiz/service.js           orchestration: devices, states, scene events, commands
src/homewhiz/constants.js         brand and appliance type codes
src/i18n/                         labels in en / fr / de / es
src/actions.js                    Configuration screen buttons
src/scenes.js                     scene actions
src/widgets.js                    dashboard widgets
gladys-assistant-integration.json manifest
docs/{en,fr,de,es}.md             user documentation, re-hosted by Gladys
test/                             node --test, against the SDK's fake Gladys (no network)
```

## Development

```bash
npm install
npm test               # node --test
npm run lint           # ESLint
npm run format:check   # Prettier
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="homewhiz" \
HOMEWHIZ_DATA_DIR=./data \
LOG_LEVEL=debug \
npm start
```

## Release

Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md),
then **Actions → Release → Run workflow** (patch / minor / major): the workflow
bumps the versions, tags, builds the `linux/amd64` + `linux/arm64` image to
`ghcr.io/gboulvin/gladys-homewhiz` and publishes the GitHub Release.

For the store: the repository carries the `gladys-assistant-integration`
topic, and the GHCR package must be **public** so that Gladys can pull it.

## Credits

The HomeWhiz protocol mapping (`src/homewhiz/controls.js`), the feature
translations (`src/i18n/labels.json`) and the test fixtures
(`test/fixtures/`) are derived from the
[Home Assistant HomeWhiz integration](https://github.com/home-assistant-HomeWhiz/home-assistant-HomeWhiz),
© 2023 Robert Wysocki and contributors, MIT License. Built from the official
[Gladys integration template](https://github.com/GladysAssistant/integration-template-js).

HomeWhiz, Beko, Grundig, Arçelik and the other brands are trademarks of their
owners. This project is not affiliated with Arçelik A.Ş.

## License

Apache-2.0
