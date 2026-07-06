import logging
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components.http import HomeAssistantView
from aiohttp import web

_LOGGER = logging.getLogger(__name__)

DOMAIN = "fullstacksecurity"
PLATFORMS = ["alarm_control_panel"]

class FullStackSecurityCardView(HomeAssistantView):
    url = "/fullstacksecurity_card/fullstacksecurity-card.js"
    name = "fullstacksecurity_card"
    requires_auth = False

    async def get(self, request):
        js = """class FullStackSecurityCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this.content) {
      this.innerHTML = `
        <ha-card header="FullStack Security">
          <div class="card-content">
            <div id="status" style="font-size: 1.5em; font-weight: bold; margin-bottom: 15px; text-align: center;"></div>
            <div id="sensors"></div>
            <div style="margin-top: 20px; text-align: center;">
              <mwc-button id="action-btn" raised></mwc-button>
            </div>
          </div>
        </ha-card>
      `;
      this.content = this.querySelector(".card-content");
      this.statusEl = this.querySelector("#status");
      this.sensorsEl = this.querySelector("#sensors");
      this.actionBtn = this.querySelector("#action-btn");
      
      this.actionBtn.addEventListener("click", () => {
        if (this._state === "disarmed") {
          this._hass.callService("alarm_control_panel", "alarm_arm_away", {
            entity_id: this.config.entity
          });
        } else {
          this._hass.callService("alarm_control_panel", "alarm_disarm", {
            entity_id: this.config.entity
          });
        }
      });
    }

    const entityId = this.config.entity;
    const stateObj = hass.states[entityId];
    if (!stateObj) {
      this.statusEl.innerHTML = "Entity not found.";
      return;
    }

    this._state = stateObj.state;
    this.updateStatus(this._state);
    
    if (this.config.sensors && Array.isArray(this.config.sensors)) {
      let sensorsHtml = "";
      this.config.sensors.forEach(sensorId => {
        const sensorObj = hass.states[sensorId];
        if (sensorObj) {
          const name = sensorObj.attributes.friendly_name || sensorId;
          const state = sensorObj.state;
          const lastUpdated = new Date(sensorObj.last_updated).toLocaleTimeString();
          
          let color = "var(--primary-text-color)";
          if (state === "on") color = "var(--error-color)"; 
          else if (state === "off") color = "var(--success-color)";
          
          sensorsHtml += `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px; padding: 5px; border-bottom: 1px solid var(--divider-color);">
              <span>${name}</span>
              <span style="color: ${color}; font-weight: bold;">
                ${state.toUpperCase()} 
                <span style="font-size: 0.8em; font-weight: normal; color: var(--secondary-text-color);">(${lastUpdated})</span>
              </span>
            </div>
          `;
        }
      });
      this.sensorsEl.innerHTML = sensorsHtml;
    }
  }

  updateStatus(state) {
    let statusText = state.toUpperCase().replace("_", " ");
    let color = "var(--label-badge-green)";
    let btnText = "DISARM";
    
    if (state === "disarmed") {
      color = "var(--label-badge-green)";
      btnText = "ARM";
    } else if (state === "arming") {
      color = "var(--label-badge-yellow)";
      statusText = "ARMING (30s)";
    } else if (state === "armed_away") {
      color = "var(--label-badge-red)";
    } else if (state === "triggered") {
      color = "var(--error-color)";
      statusText = "TRIGGERED!";
    }

    this.statusEl.innerHTML = `<span style="color: ${color};">${statusText}</span>`;
    this.actionBtn.innerText = btnText;
    
    if (btnText === "ARM") {
      this.actionBtn.style.setProperty("--mdc-theme-primary", "var(--label-badge-red)");
    } else {
      this.actionBtn.style.setProperty("--mdc-theme-primary", "var(--label-badge-green)");
    }
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("You need to define an entity (the alarm_control_panel)");
    }
    this.config = config;
  }

  getCardSize() {
    return 4;
  }
}

customElements.define("fullstacksecurity-card", FullStackSecurityCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "fullstacksecurity-card",
  name: "FullStack Security Card",
  preview: true,
  description: "A custom card for the FullStack Security plugin."
});
"""
        return web.Response(body=js, content_type="application/javascript")

async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the FullStackSecurity component."""
    hass.data.setdefault(DOMAIN, {})
    return True

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up FullStackSecurity from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    
    # Pre-import to avoid blocking call warning in HA core
    import custom_components.fullstacksecurity.alarm_control_panel
    
    # Register the Lovelace card view directly from memory!
    hass.http.register_view(FullStackSecurityCardView())
    
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
