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
  hold actions, each mappable). Works with both `event` entities and the
  legacy zigbee2mqtt `*_action` sensors
- 📢 **Sirens** with preset sound/tone, duration and volume (real `siren`
  entities and switch-based sirens both supported)
- 💡 **Lights** flash or turn solid red/white when the alarm triggers
- 🔴 **Armed indicator lights** — chosen bulbs hold any color you pick
  (default red) the whole time the system is armed, and turn off on disarm
- 📅 **Auto-arm schedule** — a routine per weekday (e.g. arm 22:30, disarm
  06:30 next morning); overnight windows are handled automatically
- ❤️ **Health page** — battery level, signal (LQI) and online/offline status
  for every sensor, button, siren and bulb, problems sorted first
- 📜 **Activity log** on the dashboard: arms, disarms, triggers, water leaks
  and schedule actions with timestamps (survives restarts)
- 📱 **Phone notifications** via the Home Assistant companion app on trigger,
  water leak, and failed arming (optionally on every arm/disarm too)
- 🖥️ **Sidebar panel** with live sensor states, arm/disarm countdowns, device
  management and all settings — themed to match your HA light/dark theme
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
   flood sensors, sirens, lights and buttons from the dropdowns
4. **Settings** tab → set delays, siren tone/volume/duration, light actions,
   armed indicator color, button actions and tick the phones that should get
   notifications → **Save settings**
5. **Schedule** tab → optionally set auto-arm/disarm times per weekday
6. Arm from the **Dashboard** tab or with your zigbee button, and keep an eye
   on batteries in the **Health** tab

## How it behaves

- **Arming**: refuses to arm (and notifies you) if a door is open. Otherwise
  counts down the exit delay, then arms.
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
