import logging
from typing import Any
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from . import DOMAIN

_LOGGER = logging.getLogger(__name__)

def get_schema(options: dict[str, Any] = None) -> vol.Schema:
    """Return the schema for the config/options flow."""
    if options is None:
        options = {}

    return vol.Schema(
        {
            vol.Optional("doors", default=options.get("doors", [])): selector.EntitySelector(
                selector.EntitySelectorConfig(domain="binary_sensor", multiple=True)
            ),
            vol.Optional("vibration", default=options.get("vibration", [])): selector.EntitySelector(
                selector.EntitySelectorConfig(domain="binary_sensor", multiple=True)
            ),
            vol.Optional("sirens", default=options.get("sirens", [])): selector.EntitySelector(
                selector.EntitySelectorConfig(domain=["siren", "switch"], multiple=True)
            ),
            vol.Optional("lights", default=options.get("lights", [])): selector.EntitySelector(
                selector.EntitySelectorConfig(domain="light", multiple=True)
            ),
            vol.Optional("buttons", default=options.get("buttons", [])): selector.EntitySelector(
                selector.EntitySelectorConfig(domain=["sensor", "event"], multiple=True)
            ),
            vol.Optional("notify", default=options.get("notify", "")): selector.TextSelector(
                selector.TextSelectorConfig(type=selector.TextSelectorType.TEXT)
            ),
        }
    )

class FullStackSecurityConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for FullStackSecurity."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        errors = {}

        if user_input is not None:
            # Note: `notify` could be a comma separated list, let's store it as is or split it.
            return self.async_create_entry(title="FullStack Security", data={}, options=user_input)

        return self.async_show_form(
            step_id="user", data_schema=get_schema(), errors=errors
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        """Get the options flow for this handler."""
        return FullStackSecurityOptionsFlow(config_entry)


class FullStackSecurityOptionsFlow(config_entries.OptionsFlow):
    """Handle options."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=get_schema(self.config_entry.options),
        )
