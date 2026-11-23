# HomeWhiz

Control and monitor in Gladys the household appliances of the **HomeWhiz**
app: washing machines, dryers, washer dryers, dishwashers, ovens, hobs,
refrigerators, air conditioners…

## Supported brands

HomeWhiz is the app of the Arçelik group. Every appliance it manages works
with this integration, whatever the brand on its front:

**Beko**, **Grundig**, **Arçelik**, **Blomberg**, **Bauknecht**,
**Elektrabregenz**, **Altus**, **Arctic**, **Defy**, **Leisure**, **Flavel**,
**Lamona**, **Dawlance**, **Voltas Beko**, as well as the HomeWhiz models of
Whirlpool, Smeg, Teka, Viking, Cylinda and V-Zug.

If the appliance shows up in your HomeWhiz app, it shows up in Gladys.

## Requirements

- Gladys Assistant **5.1 or later**.
- A **HomeWhiz account** (e-mail + password) with your appliances added in
  the app.
- Appliances connected over **Wi-Fi**. Bluetooth-only appliances cannot be
  reached from Gladys (the integration runs in a container without a
  Bluetooth radio): they are listed by the **Test the connection** button,
  but not created.
- An internet connection: the appliances are reached through the HomeWhiz
  cloud (**cloud** integration).

## Configuration

1. Open the **Configuration** tab of the integration.
2. Enter the **e-mail** and the **password** of your HomeWhiz account. Signed
   up with Google? Set a password first: in the HomeWhiz app, _My account_ →
   _Change password_ → _Forgot password_.
3. Choose the **language** of the feature names and program lists (English,
   French, German or Spanish).
4. Save, then click **Test the connection**: the message lists your Wi-Fi
   appliances and the Bluetooth-only ones.
5. Open the **Discovery** tab and add your appliances.

To **control** an appliance from Gladys (start, pause, change the program),
enable its **remote control** on the appliance itself (often a long press on
the Wi-Fi / remote button). Without it, the appliance only reports its state.

## What you get

Each appliance becomes a Gladys device whose features depend on the model:

- **State** (on, off, running, paused, delayed start) and a **Power** switch;
- **Program** and its options (temperature, spin, drying level, prewash,
  eco, quick wash…), as lists or switches you can change;
- **Phase** of the cycle (washing, rinsing, spinning, drying…);
- **Remaining time**, **duration** and **start delay**, in minutes;
- **Warnings** (door open, no water, no salt, rinse aid, filter…), one switch
  each plus a summary text;
- temperatures of the refrigerator and freezer compartments, oven
  temperature, hob zones…;
- for an **air conditioner**: on/off, mode, target temperature, fan speed,
  swing and room temperature, in the standard Gladys air conditioning card.

Each appliance is refreshed every minute and pushes its changes in real time.

## Scenes

The integration adds its own cards to the scene editor (category
**Integrations**):

- **Appliance cycle started** (trigger) — a program starts. The program
  name is available as `{{triggerEvent.data.program}}`.
- **Appliance cycle finished** (trigger) — e.g. "notify me when the
  washing is done". Same `program` variable.
- **Appliance warning** (trigger) — door open, no water, no salt… The
  warning is available as `{{triggerEvent.data.warning_label}}`.
- **Start an appliance program** (action) — optionally pick a program (its
  name as shown in Gladys, e.g. `Eco 40-60`) and a start delay in minutes,
  then start. Output `success` tells whether it worked, `reason` why not
  (`remote_control_disabled`, `unknown_program`…).
- **Control an appliance** (action) — start, pause, resume, switch on or
  switch off.

Example: start the dishwasher at night when electricity is cheap, then get a
message on your phone when the cycle is over.

## Dashboard

- **Household appliances** widget — every appliance at a glance: state,
  program, phase, time left and warnings.
- **Appliance cycle** widget — one appliance (chosen in the widget settings):
  time left, progress gauge, details and **Start / Pause / Resume / Switch
  off** buttons.

## Actions

- **Test the connection** — signs in again and lists your appliances.
- **Reload the appliances** — downloads the appliance configurations again
  (after adding an appliance in the HomeWhiz app, or after changing the
  language). Then update the devices from the **Discovery** tab.

## Troubleshooting

- **Sign-in refused**: check the e-mail and password by signing in to the
  HomeWhiz app; accounts created with Google need a password (see above).
- **An appliance is missing**: it may be Bluetooth-only (see **Test the
  connection**), or not yet added to your HomeWhiz account.
- **Commands do nothing**: enable the remote control on the appliance.
- **Logs**: open the integration in Gladys, **Logs** tab. The password and
  the tokens are never written in the logs.
