import logging
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

_LOGGER = logging.getLogger(__name__)

DOMAIN = "fullstacksecurity"

async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the FullStackSecurity component."""
    hass.data.setdefault(DOMAIN, {})
    
    # Store the configuration parameters (doors, vibration, sirens, buttons, notify, lights)
    conf = config.get(DOMAIN, {})
    hass.data[DOMAIN]["config"] = conf

    # Load the alarm control panel platform
    hass.async_create_task(
        hass.helpers.discovery.async_load_platform("alarm_control_panel", DOMAIN, {}, config)
    )

    return True
