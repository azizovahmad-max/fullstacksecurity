import logging
import os
import aiofiles
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.components.frontend import async_register_built_in_panel, async_remove_panel

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
    
    # ULTIMATE FIX: Write the JS file directly to the user's config/www directory
    try:
        www_dir = hass.config.path("www")
        if not os.path.exists(www_dir):
            os.makedirs(www_dir)
            
        js_path = os.path.join(www_dir, "fullstacksecurity-card.js")
        
        js_content = """class FullStackSecurityCard extends HTMLElement {
  set panel(panel) {
    this._panel = panel;
    if (panel && panel.config) {
      this.config = panel.config;
    }
  }

  setConfig(config) {
    this.config = config;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.content) {
      this.innerHTML = `
        <style>
          :host {
            display: block;
            font-family: 'Inter', system-ui, sans-serif;
            --glass-bg: rgba(30, 41, 59, 0.7);
            --glass-border: rgba(255, 255, 255, 0.1);
            --glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
            padding: 20px;
            box-sizing: border-box;
            width: 100%;
            height: 100%;
          }
          .container {
            background: var(--glass-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--glass-border);
            border-radius: 24px;
            padding: 40px;
            color: #f8fafc;
            box-shadow: var(--glass-shadow);
            max-width: 480px;
            margin: 20px auto;
            text-align: center;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
          }
          .container::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; height: 4px;
            background: var(--status-color, #4ade80);
            transition: background 0.4s ease;
          }
          h1 {
            margin: 0 0 10px 0;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: -0.5px;
          }
          .status-badge {
            display: inline-block;
            background: rgba(0,0,0,0.2);
            padding: 8px 16px;
            border-radius: 99px;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: var(--status-color, #4ade80);
            border: 1px solid var(--status-color, #4ade80);
            margin-bottom: 30px;
            transition: all 0.3s ease;
          }
          .sensors-list {
            text-align: left;
            background: rgba(0,0,0,0.15);
            border-radius: 16px;
            padding: 15px;
            margin-bottom: 30px;
          }
          .sensor-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
          }
          .sensor-item:last-child {
            border-bottom: none;
          }
          .sensor-name {
            font-size: 15px;
            font-weight: 500;
            color: #cbd5e1;
          }
          .sensor-state {
            font-size: 14px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .sensor-state.safe { color: #4ade80; }
          .sensor-state.alert { color: #f87171; animation: pulse 2s infinite; }
          
          .action-btn {
            background: var(--status-color, #4ade80);
            color: #000;
            border: none;
            padding: 16px 32px;
            border-radius: 16px;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            width: 100%;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          }
          .action-btn:hover {
            transform: translateY(-2px) scale(1.02);
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
          }
          .action-btn:active {
            transform: translateY(1px);
          }
          
          @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
          
          @keyframes triggeredGlow {
            0% { box-shadow: 0 0 20px rgba(248, 113, 113, 0.2); }
            50% { box-shadow: 0 0 50px rgba(248, 113, 113, 0.6); }
            100% { box-shadow: 0 0 20px rgba(248, 113, 113, 0.2); }
          }
        </style>
        <div class="container" id="main-container">
          <h1>FullStack Security</h1>
          <div class="status-badge" id="status-badge">INITIALIZING</div>
          <div class="sensors-list" id="sensors-list"></div>
          <button class="action-btn" id="action-btn">PLEASE WAIT</button>
        </div>
      `;
      this.content = this.querySelector('.container');
      this.statusBadge = this.querySelector('#status-badge');
      this.sensorsList = this.querySelector('#sensors-list');
      this.actionBtn = this.querySelector('#action-btn');
      this.mainContainer = this.querySelector('#main-container');
      
      this.actionBtn.addEventListener('click', () => {
        const entityId = (this.config && this.config.entity) || 'alarm_control_panel.fullstack_security';
        if (this._state === 'disarmed') {
          this._hass.callService('alarm_control_panel', 'alarm_arm_away', { entity_id: entityId });
        } else {
          this._hass.callService('alarm_control_panel', 'alarm_disarm', { entity_id: entityId });
        }
      });
    }

    const entityId = (this.config && this.config.entity) || 'alarm_control_panel.fullstack_security';
    const stateObj = hass.states[entityId];
    if (!stateObj) {
      this.statusBadge.innerText = "NOT CONFIGURED";
      this.statusBadge.style.color = "#94a3b8";
      this.statusBadge.style.borderColor = "#94a3b8";
      return;
    }

    this._state = stateObj.state;
    this.updateStatus(this._state);
    
    const sensors = (this.config && this.config.sensors) ? this.config.sensors : [];
    if (sensors && Array.isArray(sensors) && sensors.length > 0) {
      let sensorsHtml = '';
      sensors.forEach(sensorId => {
        const sensorObj = hass.states[sensorId];
        if (sensorObj) {
          const name = sensorObj.attributes.friendly_name || sensorId.split('.')[1].replace(/_/g, ' ');
          const state = sensorObj.state;
          const isSafe = (state === 'off');
          const stateClass = isSafe ? 'safe' : 'alert';
          const stateText = isSafe ? 'SECURE' : 'DETECTED';
          
          sensorsHtml += `
            <div class="sensor-item">
              <span class="sensor-name">${name}</span>
              <span class="sensor-state ${stateClass}">
                ${stateText}
              </span>
            </div>
          `;
        }
      });
      this.sensorsList.innerHTML = sensorsHtml;
    } else {
      this.sensorsList.innerHTML = `<div class="sensor-item"><span class="sensor-name" style="color:#64748b; font-style:italic;">No sensors connected.</span></div>`;
    }
  }

  updateStatus(state) {
    let statusText = state.toUpperCase().replace('_', ' ');
    let color = '#4ade80'; 
    let btnText = "DISARM";
    this.mainContainer.style.animation = 'none';
    
    if (state === 'disarmed') {
      color = '#4ade80';
      btnText = "ARM SYSTEM";
    } else if (state === 'arming') {
      color = '#fbbf24'; 
      statusText = "ARMING...";
    } else if (state === 'armed_away') {
      color = '#f87171'; 
    } else if (state === 'triggered') {
      color = '#ef4444'; 
      statusText = "ALARM TRIGGERED!";
      this.mainContainer.style.animation = 'triggeredGlow 2s infinite';
    }

    this.mainContainer.style.setProperty('--status-color', color);
    this.statusBadge.innerText = statusText;
    this.actionBtn.innerText = btnText;
    
    if (btnText.startsWith("ARM")) {
      this.actionBtn.style.background = '#f87171'; 
      this.actionBtn.style.color = '#fff';
    } else {
      this.actionBtn.style.background = '#4ade80'; 
      this.actionBtn.style.color = '#000';
    }
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
  description: "A custom card and panel for the FullStack Security plugin."
});
"""
        
        async with aiofiles.open(js_path, "w") as f:
            await f.write(js_content)
            
        _LOGGER.warning("FullStackSecurity successfully deployed custom card to %s", js_path)
    except Exception as e:
        _LOGGER.error("Failed to write JS file to www directory: %s", e)
    
    # Store options for the alarm panel to use
    hass.data[DOMAIN][entry.entry_id] = entry.options


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
                "entity": f"alarm_control_panel.fullstack_security",
                "sensors": sensors
            },
            require_admin=False,
        )
    except Exception as e:
        _LOGGER.error("Failed to register sidebar panel: %s", e)
        
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)


    # Listen for options updates
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))

    return True

async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id)
        try:
            async_remove_panel(hass, "fullstacksecurity")
        except:
            pass

    return unload_ok

async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload config entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)
