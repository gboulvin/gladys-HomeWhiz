# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-23

### Added

- First version of the HomeWhiz integration: Beko, Grundig, Arçelik,
  Blomberg, Bauknecht, Elektrabregenz, Altus, Arctic, Defy, Leisure, Flavel,
  Lamona, Dawlance, Voltas Beko… appliances connected over Wi-Fi, through the
  HomeWhiz cloud (cloud transport).
- Washing machines, washer dryers, dryers, dishwashers, ovens, hobs,
  refrigerators and air conditioners: state and power switch, program and
  options, cycle phase, remaining time, duration, start delay, warnings,
  temperatures; air conditioners in the standard Gladys air conditioning card.
- Real-time updates (AWS IoT MQTT) and a refresh every minute.
- Scene triggers: cycle started, cycle finished, appliance warning.
- Scene actions: start a program (with an optional start delay), control an
  appliance (start, pause, resume, switch on, switch off).
- Dashboard widgets: every appliance at a glance, and one appliance with its
  progress and start / pause / off buttons.
- Configuration buttons: test the connection (lists the Wi-Fi and the
  Bluetooth-only appliances), reload the appliances.
- English, French, German and Spanish everywhere: configuration, feature and
  program names, widgets, scene cards and user documentation.
- `SECURITY.md`, `CLAUDE.md` and third-party notices.

[Unreleased]: https://github.com/gboulvin/gladys-HomeWhiz/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/gboulvin/gladys-HomeWhiz/releases/tag/v1.0.0
