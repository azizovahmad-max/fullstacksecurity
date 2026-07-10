# FullStack Security

A simple, Alarmo-style security system for Home Assistant, built around
**zigbee2mqtt** door/window contacts, vibration sensors, water leak sensors,
wireless buttons, sirens and bulbs.

Everything is managed from a **Security** panel in the sidebar — no YAML, no
automations to write.

## Features

- 🛡️ **Armed / disarmed** alarm with exit delay (time to leave) and entry
  delay (time to disarm before the sirens fire)
- 🚪 **Door/window + vibration sensors** trigger the alarm while armed
- 💧 **Flood sensors monitored 24/7** — water leaks sound the sirens and
  notify your phones even when the system is disarmed
- 🔘 **Wireless buttons** arm/disarm the system (single / double / triple /
  hold actions, each mappable). Works with `event` entities, legacy
  zigbee2mqtt `*_action` sensors, **and buttons that only publish over MQTT**
  (e.g. TS004F) — add those by their zigbee2mqtt device name and the plugin
  subscribes to `zigbee2mqtt/<name>` directly, no entity required
- 📢 **Sirens** with preset sound/tone, duration and volume (real `siren`
  entities and switch-based sirens both supported)
- 🚦 **Lights that do double duty** — the same bulbs show the system state
  by color (pick-your-own **armed color**, default red, and optionally a
  **disarmed color**, default green — or off when disarmed), optionally
  **flash during the exit delay**, and flash or turn solid red/white when
  the alarm triggers
- 📅 **Auto-arm schedule** — a routine per weekday (e.g. arm 22:30, disarm
  06:30 next morning); overnight windows are handled automatically
- ❤️ **Health page** — battery level, signal (LQI) and online/offline status
  for every sensor, button, siren and bulb, problems sorted first
- 🔔 **Automatic health alerts** — a self-check runs at times you set (1–2×
  a day) and pushes a phone notification listing any offline or low-battery
  devices so you can fix them before they matter; includes a "test now"
  button. Low-battery threshold is configurable
- 📜 **Activity log** on the dashboard: arms, disarms, triggers, water leaks
  and schedule actions with timestamps (survives restarts)
- 📱 **Phone notifications** via the Home Assistant companion app on trigger,
  water leak, and failed arming (optionally on every arm/disarm too)
- 🔕➡️🔔 **Critical alerts** — alarm, leak and sensor-offline notifications
  break through Do Not Disturb / silent mode on iOS and Android, with
  **Disarm / Silence siren** buttons right in the notification (togglable)
- 🛰️ **Sensor lost while armed** — if a door/vibration sensor drops offline
  while the system is armed you're alerted immediately (dying battery or
  interference), with a follow-up when it comes back online
- 🖥️ **Sidebar panel** with live sensor states, arm/disarm countdowns, device
  management and all settings — themed to match your HA light/dark theme
- 🧩 **Dashboard card** (`custom:fullstacksecurity-card`) for normal Home
  Assistant dashboards, showing the alarm and every configured device status
- 🔁 Alarm state survives Home Assistant restarts

The integration creates two entities you can also use in automations:

| Entity | Purpose |
|---|---|
| `alarm_control_panel.fullstack_security` | The alarm itself (disarmed / arming / armed_away / pending / triggered) |
| `binary_sensor.fullstack_security_flood_alert` | On while any flood sensor is wet |

It also fires `fullstacksecurity_triggered` and `fullstacksecurity_flood`
events on the bus for custom automations.

## Installation

### HACS (recommended)

1. HACS → three-dot menu (top right) → **Custom repositories**
2. Repository: `https://github.com/azizovahmad-max/fullstacksecurity`,
   type: **Integration** → **Add**
3. Search for **FullStack Security** in HACS and install it
4. Restart Home Assistant

### Manual

Copy `custom_components/fullstacksecurity` into your Home Assistant
`config/custom_components/` folder and restart.

## Setup

1. **Settings → Devices & Services → Add Integration → FullStack Security**
   (one click, no options — everything is configured in the panel)
2. A **Security** item appears in the sidebar
3. Open it → **Devices** tab → add your door sensors, vibration sensors,
   flood sensors, sirens, lights and buttons from the dropdowns. For a
   zigbee button that doesn't appear in the dropdown, use the **zigbee2mqtt
   button** box in the Buttons section and type its exact z2m device name
   (the name shown in the zigbee2mqtt frontend, e.g. `SecuritySwitch`)
4. **Settings** tab → set delays, siren tone/volume/duration, light actions,
   armed indicator color, button actions and tick the phones that should get
   notifications → **Save settings**
5. **Schedule** tab → optionally set auto-arm/disarm times per weekday
6. Arm from the **Dashboard** tab or with your zigbee button, and keep an eye
   on batteries in the **Health** tab

## Home Assistant dashboard card

The standard Home Assistant alarm card only shows the alarm entity. To show all
FullStack Security sensors and their live status on a normal dashboard:

1. Restart Home Assistant after installing/updating the integration
2. Edit your dashboard → **Add card** → **Manual**
3. Paste:

```yaml
type: custom:fullstacksecurity-card
```

If you renamed the alarm entity, include it:

```yaml
type: custom:fullstacksecurity-card
entity: alarm_control_panel.fullstack_security
```

## How it behaves

- **Arming**: refuses to arm (and notifies you) if any security sensor is
  open **or offline/dead** — the dashboard shows exactly which ones and
  disables the arm button until they're fixed. Otherwise counts down the
  exit delay, then arms.
- **While armed**: a door opening or vibration starts the entry delay
  countdown — disarm in time or the sirens, lights and notifications fire.
- **Sirens** run for the configured duration (or until disarmed).
  Disarming always silences everything.
- **Flood**: independent of arm state. Wet sensor → siren (optional) +
  phone notification; when everything is dry again the siren stops and you
  get an all-clear message.

## Notes

- Requires Home Assistant **2024.12** or newer.
- Phone notifications use the standard `notify.mobile_app_*` services from
  the [Home Assistant companion app](https://companion.home-assistant.io/).
