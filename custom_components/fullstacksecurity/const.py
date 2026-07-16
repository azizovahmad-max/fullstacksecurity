"""Constants for the FullStack Security integration."""

DOMAIN = "fullstacksecurity"
VERSION = "2.14.0"

PANEL_URL_PATH = "fullstacksecurity"
PANEL_NAME = "fullstacksecurity-panel"
STATIC_URL_BASE = "/fullstacksecurity_static"
PANEL_JS_URL = f"{STATIC_URL_BASE}/panel.js?v={VERSION}"

ALARM_ENTITY_NAME = "FullStack Security"

SERVICE_UPDATE_CONFIG = "update_config"

# Entity list option keys (each holds a list of entity_ids)
CONF_DOORS = "doors"
CONF_VIBRATION = "vibration"
CONF_FLOOD = "flood"
CONF_SIRENS = "sirens"
CONF_LIGHTS = "lights"
# Legacy key (v2.7-v2.10 had a separate status-indicator list; now merged
# into CONF_LIGHTS - kept only for the one-time migration on setup).
CONF_ARMED_LIGHTS = "armed_lights"
CONF_BUTTONS = "buttons"
CONF_MQTT_BUTTONS = "mqtt_buttons"
# Display labels and areas are local to FullStack Security. They never rename
# the original Home Assistant entities.
CONF_DEVICE_NAMES = "device_names"
CONF_DEVICE_ZONES = "device_zones"

ENTITY_LIST_KEYS = (
    CONF_DOORS,
    CONF_VIBRATION,
    CONF_FLOOD,
    CONF_SIRENS,
    CONF_LIGHTS,
    CONF_BUTTONS,
    CONF_MQTT_BUTTONS,
)

# Settings option keys
CONF_ARMING_DELAY = "arming_delay"
CONF_ENTRY_DELAY = "entry_delay"
CONF_SIREN_DURATION = "siren_duration"
CONF_SIREN_TONE = "siren_tone"
CONF_SIREN_TONES = "siren_tones"
CONF_SIREN_VOLUME = "siren_volume"
CONF_LIGHT_MODE = "light_mode"
CONF_LIGHT_DURATION = "light_duration"
CONF_ARMED_LIGHT_COLOR = "armed_light_color"
CONF_ARMING_FLASH = "arming_flash"
CONF_DISARMED_LIGHTS_ON = "disarmed_lights_on"
CONF_DISARMED_LIGHT_COLOR = "disarmed_light_color"
CONF_NOTIFY_SERVICES = "notify_services"
CONF_NOTIFY_ARM_DISARM = "notify_arm_disarm"
CONF_CRITICAL_ALERTS = "critical_alerts"
CONF_FLOOD_SIREN = "flood_siren"
CONF_BUTTON_SINGLE = "button_single"
CONF_BUTTON_DOUBLE = "button_double"
CONF_BUTTON_TRIPLE = "button_triple"
CONF_BUTTON_HOLD = "button_hold"
CONF_SCHEDULES_ENABLED = "schedules_enabled"
CONF_SCHEDULES = "schedules"
CONF_HEALTH_CHECK_ENABLED = "health_check_enabled"
CONF_HEALTH_CHECK_DAYS = "health_check_days"
CONF_HEALTH_CHECK_TIMES = "health_check_times"
CONF_HEALTH_BATTERY_THRESHOLD = "health_battery_threshold"

SETTINGS_KEYS = (
    CONF_ARMING_DELAY,
    CONF_ENTRY_DELAY,
    CONF_SIREN_DURATION,
    CONF_SIREN_TONE,
    CONF_SIREN_TONES,
    CONF_SIREN_VOLUME,
    CONF_LIGHT_MODE,
    CONF_LIGHT_DURATION,
    CONF_ARMED_LIGHT_COLOR,
    CONF_ARMING_FLASH,
    CONF_DISARMED_LIGHTS_ON,
    CONF_DISARMED_LIGHT_COLOR,
    CONF_NOTIFY_SERVICES,
    CONF_NOTIFY_ARM_DISARM,
    CONF_CRITICAL_ALERTS,
    CONF_FLOOD_SIREN,
    CONF_BUTTON_SINGLE,
    CONF_BUTTON_DOUBLE,
    CONF_BUTTON_TRIPLE,
    CONF_BUTTON_HOLD,
    CONF_SCHEDULES_ENABLED,
    CONF_SCHEDULES,
    CONF_HEALTH_CHECK_ENABLED,
    CONF_HEALTH_CHECK_DAYS,
    CONF_HEALTH_CHECK_TIMES,
    CONF_HEALTH_BATTERY_THRESHOLD,
)

WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

DEFAULTS = {
    CONF_DOORS: [],
    CONF_VIBRATION: [],
    CONF_FLOOD: [],
    CONF_SIRENS: [],
    CONF_LIGHTS: [],
    CONF_BUTTONS: [],
    CONF_MQTT_BUTTONS: [],
    CONF_DEVICE_NAMES: {},
    CONF_DEVICE_ZONES: {},
    CONF_ARMING_DELAY: 30,
    CONF_ENTRY_DELAY: 30,
    CONF_SIREN_DURATION: 0,
    CONF_SIREN_TONE: "",
    CONF_SIREN_TONES: {},
    CONF_SIREN_VOLUME: 100,
    CONF_LIGHT_MODE: "flash_long",
    CONF_LIGHT_DURATION: 0,
    CONF_ARMED_LIGHT_COLOR: "#ff0000",
    CONF_ARMING_FLASH: False,
    CONF_DISARMED_LIGHTS_ON: False,
    CONF_DISARMED_LIGHT_COLOR: "#00c800",
    CONF_NOTIFY_SERVICES: [],
    CONF_NOTIFY_ARM_DISARM: False,
    CONF_CRITICAL_ALERTS: True,
    CONF_FLOOD_SIREN: True,
    CONF_BUTTON_SINGLE: "arm",
    CONF_BUTTON_DOUBLE: "disarm",
    CONF_BUTTON_TRIPLE: "none",
    CONF_BUTTON_HOLD: "none",
    CONF_SCHEDULES_ENABLED: False,
    CONF_SCHEDULES: {},
    CONF_HEALTH_CHECK_ENABLED: False,
    CONF_HEALTH_CHECK_DAYS: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    CONF_HEALTH_CHECK_TIMES: ["09:00", "21:00"],
    CONF_HEALTH_BATTERY_THRESHOLD: 20,
}

BUTTON_ACTIONS = ("arm", "disarm", "toggle", "none")
LIGHT_MODES = ("flash_long", "flash_short", "solid_red", "solid_white")

EVENT_TRIGGERED = f"{DOMAIN}_triggered"
EVENT_FLOOD = f"{DOMAIN}_flood"
EVENT_RUN_HEALTH_CHECK = f"{DOMAIN}_run_health_check"

# Companion-app notification action ids and tags
NOTIFY_ACTION_DISARM = "FULLSTACKSECURITY_DISARM"
NOTIFY_ACTION_SILENCE = "FULLSTACKSECURITY_SILENCE"
NOTIFY_TAG_ALARM = "fullstacksecurity_alarm"
NOTIFY_TAG_FLOOD = "fullstacksecurity_flood"


def opt(options: dict, key: str):
    """Read an option with fallback to its default."""
    value = options.get(key)
    if value is None:
        return DEFAULTS[key]
    return value


def get_notify_services(options: dict) -> list[str]:
    """Return the configured notify services, tolerating legacy formats.

    v1 stored a comma separated string under "notify_phones" or "notify";
    v2 stores a list under "notify_services".
    """
    value = options.get(CONF_NOTIFY_SERVICES)
    if isinstance(value, list):
        return [v for v in value if v]
    legacy = options.get("notify_phones") or options.get("notify") or ""
    if isinstance(legacy, str):
        return [n.strip() for n in legacy.split(",") if n.strip()]
    return []
