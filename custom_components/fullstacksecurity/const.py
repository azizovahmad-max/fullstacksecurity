"""Constants for the FullStack Security integration."""

DOMAIN = "fullstacksecurity"
VERSION = "2.0.0"

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
CONF_BUTTONS = "buttons"

ENTITY_LIST_KEYS = (
    CONF_DOORS,
    CONF_VIBRATION,
    CONF_FLOOD,
    CONF_SIRENS,
    CONF_LIGHTS,
    CONF_BUTTONS,
)

# Settings option keys
CONF_ARMING_DELAY = "arming_delay"
CONF_ENTRY_DELAY = "entry_delay"
CONF_SIREN_DURATION = "siren_duration"
CONF_SIREN_TONE = "siren_tone"
CONF_LIGHT_MODE = "light_mode"
CONF_LIGHT_DURATION = "light_duration"
CONF_NOTIFY_SERVICES = "notify_services"
CONF_FLOOD_SIREN = "flood_siren"
CONF_BUTTON_SINGLE = "button_single"
CONF_BUTTON_DOUBLE = "button_double"
CONF_BUTTON_TRIPLE = "button_triple"
CONF_BUTTON_HOLD = "button_hold"

SETTINGS_KEYS = (
    CONF_ARMING_DELAY,
    CONF_ENTRY_DELAY,
    CONF_SIREN_DURATION,
    CONF_SIREN_TONE,
    CONF_LIGHT_MODE,
    CONF_LIGHT_DURATION,
    CONF_NOTIFY_SERVICES,
    CONF_FLOOD_SIREN,
    CONF_BUTTON_SINGLE,
    CONF_BUTTON_DOUBLE,
    CONF_BUTTON_TRIPLE,
    CONF_BUTTON_HOLD,
)

DEFAULTS = {
    CONF_DOORS: [],
    CONF_VIBRATION: [],
    CONF_FLOOD: [],
    CONF_SIRENS: [],
    CONF_LIGHTS: [],
    CONF_BUTTONS: [],
    CONF_ARMING_DELAY: 30,
    CONF_ENTRY_DELAY: 30,
    CONF_SIREN_DURATION: 300,
    CONF_SIREN_TONE: "",
    CONF_LIGHT_MODE: "flash_long",
    CONF_LIGHT_DURATION: 0,
    CONF_NOTIFY_SERVICES: [],
    CONF_FLOOD_SIREN: True,
    CONF_BUTTON_SINGLE: "arm",
    CONF_BUTTON_DOUBLE: "disarm",
    CONF_BUTTON_TRIPLE: "none",
    CONF_BUTTON_HOLD: "none",
}

BUTTON_ACTIONS = ("arm", "disarm", "toggle", "none")
LIGHT_MODES = ("flash_long", "flash_short", "solid_red", "solid_white")

EVENT_TRIGGERED = f"{DOMAIN}_triggered"
EVENT_FLOOD = f"{DOMAIN}_flood"


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
