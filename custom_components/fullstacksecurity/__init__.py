"""FullStack Security - a simple Alarmo-style security system for zigbee2mqtt gear."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel,
)
try:
    # The stable API for making a JS module load on every frontend page,
    # so the custom Lovelace card element is defined on dashboards too.
    from homeassistant.components.frontend import add_extra_js_url
except ImportError:  # pragma: no cover - very old HA; sidebar panel still works
    add_extra_js_url = None
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall

from .const import (
    DOMAIN,
    ENTITY_LIST_KEYS,
    EVENT_RUN_HEALTH_CHECK,
    PANEL_JS_URL,
    PANEL_NAME,
    PANEL_URL_PATH,
    SERVICE_UPDATE_CONFIG,
    SETTINGS_KEYS,
    STATIC_URL_BASE,
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["alarm_control_panel", "binary_sensor"]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the FullStackSecurity component."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up FullStackSecurity from a config entry."""
    data = hass.data.setdefault(DOMAIN, {})

    # Serve the panel javascript straight from the integration directory.
    if not data.get("static_registered"):
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    STATIC_URL_BASE,
                    str(Path(__file__).parent / "www"),
                    cache_headers=False,
                )
            ]
        )
        data["static_registered"] = True

    if add_extra_js_url and not data.get("frontend_module_registered"):
        add_extra_js_url(hass, PANEL_JS_URL)
        data["frontend_module_registered"] = True
        _LOGGER.debug("Registered frontend card module: %s", PANEL_JS_URL)

    # Also register as a Lovelace resource so the mobile companion app
    # picks up the card element even when add_extra_js_url is ignored.
    if not data.get("lovelace_resource_registered"):
        try:
            from homeassistant.components.lovelace.resources import (
                ResourceStorageCollection,
            )
            if "lovelace" in hass.data and hasattr(hass.data["lovelace"], "resources"):
                resources: ResourceStorageCollection = hass.data["lovelace"].resources
                # Only add if not already present.
                already = any(
                    r.get("url", "").startswith(STATIC_URL_BASE)
                    for r in (resources.async_items() if hasattr(resources, "async_items") else [])
                )
                if not already:
                    await resources.async_create_item(
                        {"res_type": "module", "url": PANEL_JS_URL}
                    )
                    _LOGGER.debug("Registered Lovelace resource: %s", PANEL_JS_URL)
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Lovelace resource registration skipped (YAML mode or unavailable)")
        data["lovelace_resource_registered"] = True

    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title="Security",
        sidebar_icon="mdi:shield-home",
        frontend_url_path=PANEL_URL_PATH,
        require_admin=False,
        update=True,
        config={
            "_panel_custom": {
                "name": PANEL_NAME,
                "js_url": PANEL_JS_URL,
                "embed_iframe": False,
                "trust_external": False,
            }
        },
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))

    if not hass.services.has_service(DOMAIN, SERVICE_UPDATE_CONFIG):

        async def handle_update_config(call: ServiceCall) -> None:
            entries = hass.config_entries.async_entries(DOMAIN)
            if not entries:
                return
            target = entries[0]
            options = dict(target.options)
            action = call.data.get("action")

            if action in ("add", "remove"):
                list_key = call.data.get("type")
                entity_id = call.data.get("entity_id")
                if list_key not in ENTITY_LIST_KEYS or not entity_id:
                    _LOGGER.warning(
                        "update_config ignored: bad type/entity (%s / %s)",
                        list_key,
                        entity_id,
                    )
                    return
                items = list(options.get(list_key) or [])
                if action == "add" and entity_id not in items:
                    items.append(entity_id)
                elif action == "remove" and entity_id in items:
                    items.remove(entity_id)
                options[list_key] = items
            elif action == "settings":
                for key in SETTINGS_KEYS:
                    if key in call.data:
                        options[key] = call.data[key]
            elif action == "health_check":
                # Manual "test now"; the alarm entity listens for this event.
                hass.bus.async_fire(EVENT_RUN_HEALTH_CHECK)
                return
            else:
                _LOGGER.warning("update_config ignored: unknown action %s", action)
                return

            hass.config_entries.async_update_entry(target, options=options)

        hass.services.async_register(DOMAIN, SERVICE_UPDATE_CONFIG, handle_update_config)

    # Best effort cleanup of the js files that v1 dumped into config/www.
    def _cleanup_legacy_files() -> None:
        www = Path(hass.config.path("www"))
        if www.is_dir():
            for stale in www.glob("fullstacksecurity-card*.js"):
                try:
                    stale.unlink()
                except OSError:
                    pass

    await hass.async_add_executor_job(_cleanup_legacy_files)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Clean up when the integration is removed entirely."""
    async_remove_panel(hass, PANEL_URL_PATH)
    if hass.services.has_service(DOMAIN, SERVICE_UPDATE_CONFIG):
        hass.services.async_remove(DOMAIN, SERVICE_UPDATE_CONFIG)


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload the config entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)
