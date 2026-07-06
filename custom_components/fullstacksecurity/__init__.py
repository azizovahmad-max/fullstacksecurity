import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

DOMAIN = "fullstacksecurity"
PLATFORMS = ["alarm_control_panel"]

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the FullStackSecurity component."""
    hass.data.setdefault(DOMAIN, {})
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up FullStackSecurity from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    
    # Pre-import to avoid blocking call warning in HA core
    import custom_components.fullstacksecurity.alarm_control_panel
    
    # Serve the custom Lovelace card directly from the integration folder
    hass.http.register_static_path(
        "/fullstacksecurity_card",
        hass.config.path("custom_components/fullstacksecurity/www"),
        cache_headers=False
    )
    
    # Store options for the alarm panel to use
    hass.data[DOMAIN][entry.entry_id] = entry.options

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # Listen for options updates
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unload_ok

async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload config entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)
