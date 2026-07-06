import json

# 1. Update manifest.json
with open("custom_components/fullstacksecurity/manifest.json", "r") as f:
    manifest = json.load(f)
manifest["version"] = "1.0.7"
with open("custom_components/fullstacksecurity/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)

# 2. Add sidebar panel back to __init__.py
with open("custom_components/fullstacksecurity/__init__.py", "r") as f:
    code = f.read()

import_statement = "from homeassistant.components.frontend import async_register_built_in_panel, async_remove_panel"
if import_statement not in code:
    code = code.replace("from homeassistant.core import HomeAssistant", f"from homeassistant.core import HomeAssistant\n{import_statement}")

setup_panel_code = """
    # Register Sidebar Panel
    try:
        sensors = entry.options.get("doors", []) + entry.options.get("vibration", [])
        async_register_built_in_panel(
            hass,
            component_name="custom",
            sidebar_title="Security",
            sidebar_icon="mdi:shield-home",
            frontend_url_path="fullstacksecurity",
            config={
                "_panel_custom": {
                    "name": "fullstacksecurity-card",
                    "js_url": "/local/fullstacksecurity-card.js?v=1.0.7",
                    "embed_iframe": False,
                    "trust_external": False,
                },
                "entity": f"alarm_control_panel.full_stack_security",
                "sensors": sensors
            },
            require_admin=False,
        )
    except Exception as e:
        _LOGGER.error("Failed to register sidebar panel: %s", e)
        
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
"""

code = code.replace("    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)", setup_panel_code)

unload_code = """
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
        try:
            async_remove_panel(hass, "fullstacksecurity")
        except:
            pass
"""
code = code.replace("""    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)""", unload_code)

with open("custom_components/fullstacksecurity/__init__.py", "w") as f:
    f.write(code)
