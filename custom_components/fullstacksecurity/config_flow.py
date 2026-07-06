"""Config flow for FullStack Security."""

from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries

from .const import DOMAIN


class FullStackSecurityConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """One-click setup; everything is configured from the Security panel."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(
                title="FullStack Security", data={}, options={}
            )

        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))
