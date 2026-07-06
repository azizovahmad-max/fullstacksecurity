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
            
        js_path = os.path.join(www_dir, "fullstacksecurity-card-v16.js")
        
        js_content = """class FullStackSecurityCardV16 extends HTMLElement {
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
            width: 100%;
            box-sizing: border-box;
          }
          ha-card {
            background: var(--glass-bg, rgba(30, 41, 59, 0.9));
            border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.1));
            border-radius: var(--ha-card-border-radius, 16px);
            padding: 20px;
            color: #f8fafc;
            box-shadow: var(--ha-card-box-shadow, 0 8px 32px 0 rgba(0, 0, 0, 0.3));
            text-align: center;
            transition: all 0.4s ease;
            position: relative;
            overflow: hidden;
            box-sizing: border-box;
            width: 100%;
          }
          ha-card::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; height: 4px;
            background: var(--status-color, #4ade80);
            transition: background 0.4s ease;
          }
          .header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            flex-wrap: wrap;
            gap: 10px;
          }
          h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
            letter-spacing: -0.5px;
            text-align: left;
            flex: 1;
          }
          .config-btn {
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: #e2e8f0;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
            white-space: nowrap;
          }
          .config-btn:hover {
            background: rgba(255,255,255,0.2);
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
            margin-bottom: 24px;
            transition: all 0.3s ease;
          }
          .group-title {
            text-align: left;
            font-size: 13px;
            font-weight: 700;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
            margin-top: 20px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            padding-bottom: 5px;
          }
          .sensors-list {
            text-align: left;
            background: rgba(0,0,0,0.15);
            border-radius: 12px;
            padding: 12px;
            margin-bottom: 24px;
            width: 100%;
            box-sizing: border-box;
          }
          .sensor-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            flex-wrap: wrap;
            gap: 10px;
          }
          .sensor-item:last-child {
            border-bottom: none;
          }
          .sensor-name {
            font-size: 14px;
            font-weight: 500;
            color: #cbd5e1;
            flex: 1;
            min-width: 120px;
          }
          .sensor-state {
            font-size: 13px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
            white-space: nowrap;
          }
          .sensor-state.safe { color: #4ade80; }
          .sensor-state.alert { color: #f87171; animation: pulse 2s infinite; }
          .sensor-state.neutral { color: #fbbf24; }
          
          .action-btn {
            background: var(--status-color, #4ade80);
            color: #000;
            border: none;
            padding: 16px;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            width: 100%;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            box-sizing: border-box;
            display: block;
          }
          .action-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.3);
          }
          .action-btn:active {
            transform: translateY(1px);
          }
          
          /* Modal Styles */
          .modal-overlay {
            display: none;
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.9);
            backdrop-filter: blur(8px);
            z-index: 100;
            justify-content: center;
            align-items: center;
          }
          .modal-content {
            background: rgba(30, 41, 59, 1);
            padding: 24px;
            border-radius: 16px;
            width: 90%;
            max-width: 400px;
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
            text-align: left;
            box-sizing: border-box;
          }
          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
          }
          .modal-header h2 {
            margin: 0;
            font-size: 18px;
          }
          .close-modal {
            background: none;
            border: none;
            color: #94a3b8;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            line-height: 1;
          }
          .close-modal:hover { color: #fff; }
          .form-group {
            margin-bottom: 16px;
          }
          .form-group label {
            display: block;
            margin-bottom: 6px;
            font-size: 13px;
            color: #cbd5e1;
          }
          select {
            width: 100%;
            padding: 10px;
            background: rgba(0,0,0,0.2);
            border: 1px solid rgba(255,255,255,0.1);
            color: #fff;
            border-radius: 8px;
            font-size: 14px;
            box-sizing: border-box;
          }
          select option {
            background: #1e293b;
          }
          .add-btn {
            background: #3b82f6;
            color: #fff;
            border: none;
            padding: 12px;
            width: 100%;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 10px;
            box-sizing: border-box;
          }
          .add-btn:hover { background: #2563eb; }
          .remove-btn {
            background: rgba(239, 68, 68, 0.2);
            color: #fca5a5;
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 4px;
            padding: 4px 8px;
            font-size: 12px;
            cursor: pointer;
          }
          .remove-btn:hover { background: rgba(239, 68, 68, 0.4); }
          
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
        <ha-card id="main-container">
          <div class="header-row">
            <h1>FullStack Security</h1>
            <button class="config-btn" id="config-btn">Configure</button>
          </div>
          <div class="status-badge" id="status-badge">INITIALIZING</div>
          <div class="sensors-list" id="sensors-list"></div>
          <button class="action-btn" id="action-btn">PLEASE WAIT</button>
          
          <div class="modal-overlay" id="config-modal">
            <div class="modal-content">
              <div class="modal-header">
                <h2>Add Sensor</h2>
                <button class="close-modal" id="close-modal">&times;</button>
              </div>
              
              <div class="form-group">
                <label>Sensor Type</label>
                <select id="type-select">
                  <option value="doors">Door Sensor</option>
                  <option value="vibration">Vibration Sensor</option>
                  <option value="sirens">Siren/Alarm</option>
                </select>
              </div>
              
              <div class="form-group">
                <label>Select Entity</label>
                <select id="entity-select">
                  <option value="">Select a device...</option>
                </select>
              </div>
              
              <button class="add-btn" id="add-entity-btn">ADD SENSOR</button>
            </div>
          </div>
        </ha-card>
      `;
      this.content = this.querySelector('ha-card');
      this.statusBadge = this.querySelector('#status-badge');
      this.sensorsList = this.querySelector('#sensors-list');
      this.actionBtn = this.querySelector('#action-btn');
      this.mainContainer = this.querySelector('#main-container');
      
      this.configBtn = this.querySelector('#config-btn');
      this.configModal = this.querySelector('#config-modal');
      this.closeModalBtn = this.querySelector('#close-modal');
      this.entitySelect = this.querySelector('#entity-select');
      this.typeSelect = this.querySelector('#type-select');
      this.addEntityBtn = this.querySelector('#add-entity-btn');
      
      this.actionBtn.addEventListener('click', () => {
        const entity = this._entityId || 'alarm_control_panel.fullstack_security';
        if (this._state === 'disarmed') {
          this._hass.callService('alarm_control_panel', 'alarm_arm_away', { entity_id: entity });
        } else {
          this._hass.callService('alarm_control_panel', 'alarm_disarm', { entity_id: entity });
        }
      });
      
      this.configBtn.addEventListener('click', () => {
        this.populateDropdown();
        this.configModal.style.display = 'flex';
      });
      
      this.closeModalBtn.addEventListener('click', () => {
        this.configModal.style.display = 'none';
      });
      
      this.addEntityBtn.addEventListener('click', () => {
        const entityId = this.entitySelect.value;
        const type = this.typeSelect.value;
        if (!entityId) return;
        
        this._hass.callService('fullstacksecurity', 'update_config', {
            entity_id: entityId,
            type: type,
            action: 'add'
        });
        this.configModal.style.display = 'none';
      });
    }

    let entityId = this.config && this.config.entity;
    if (!entityId || !hass.states[entityId]) {
      const allAlarms = Object.keys(hass.states).filter(k => k.startsWith('alarm_control_panel.'));
      const found = allAlarms.find(k => k.includes('fullstack') || k.includes('full_stack'));
      if (found) {
        entityId = found;
      } else {
        entityId = 'alarm_control_panel.fullstack_security'; 
      }
    }
    this._entityId = entityId;

    const stateObj = hass.states[entityId];
    if (!stateObj) {
      this.statusBadge.innerText = "NOT CONFIGURED";
      this.statusBadge.style.color = "#94a3b8";
      this.statusBadge.style.borderColor = "#94a3b8";
      this.sensorsList.innerHTML = `<div class="sensor-item"><span class="sensor-name" style="color:#64748b; font-size:12px;">Entity not found: ${entityId}. Check HA logs.</span></div>`;
      return;
    }

    this._state = stateObj.state;
    this.updateStatus(this._state);
    
    const attrs = stateObj.attributes || {};
    const doors = attrs.doors || [];
    const vibrations = attrs.vibration || [];
    const sirens = attrs.sirens || [];

    let sensorsHtml = '';
    
    const renderGroup = (title, items, type) => {
        if (!items || items.length === 0) return '';
        let html = `<div class="group-title">${title}</div>`;
        items.forEach(sensorId => {
            const sensorObj = hass.states[sensorId];
            const name = sensorObj ? (sensorObj.attributes.friendly_name || sensorId.split('.')[1].replace(/_/g, ' ')) : sensorId;
            const state = sensorObj ? sensorObj.state : 'unavailable';
            let stateClass = '';
            let stateText = '';
            
            if (type === 'door') {
                const isSafe = (state === 'off' || state === 'closed');
                stateClass = isSafe ? 'safe' : 'alert';
                stateText = isSafe ? 'CLOSED' : 'OPEN';
            } else if (type === 'vibration') {
                const isSafe = (state === 'off' || state === 'clear');
                stateClass = isSafe ? 'safe' : 'alert';
                stateText = isSafe ? 'CLEAR' : 'DETECTED';
            } else if (type === 'siren') {
                const isOn = (state === 'on');
                stateClass = isOn ? 'alert' : 'safe';
                stateText = isOn ? 'SOUNDING' : 'OFF';
            }
            
            if (state === 'unavailable') {
                stateClass = 'neutral';
                stateText = 'UNAVAILABLE';
            }
            
            html += `
              <div class="sensor-item">
                <span class="sensor-name">${name}</span>
                <span class="sensor-state ${stateClass}">
                  ${stateText}
                  <button class="remove-btn" onclick="this.getRootNode().host.removeSensor('${sensorId}', '${type === 'door' ? 'doors' : (type === 'vibration' ? 'vibration' : 'sirens')}')">X</button>
                </span>
              </div>
            `;
        });
        return html;
    };

    sensorsHtml += renderGroup('Doors', doors, 'door');
    sensorsHtml += renderGroup('Vibration Sensors', vibrations, 'vibration');
    sensorsHtml += renderGroup('Sirens & Alarms', sirens, 'siren');

    if (sensorsHtml === '') {
      this.sensorsList.innerHTML = `<div class="sensor-item"><span class="sensor-name" style="color:#64748b; font-style:italic;">No sensors connected. Click Configure to add them.</span></div>`;
    } else {
      this.sensorsList.innerHTML = sensorsHtml;
    }
  }
  
  removeSensor(entityId, type) {
    this._hass.callService('fullstacksecurity', 'update_config', {
        entity_id: entityId,
        type: type,
        action: 'remove'
    });
  }
  
  populateDropdown() {
    let options = '<option value="">Select a device...</option>';
    const entities = Object.keys(this._hass.states).filter(k => k.startsWith('binary_sensor.') || k.startsWith('siren.') || k.startsWith('switch.'));
    entities.sort().forEach(e => {
        const obj = this._hass.states[e];
        const name = obj.attributes.friendly_name || e;
        options += `<option value="${e}">${name} (${e.split('.')[0]})</option>`;
    });
    this.entitySelect.innerHTML = options;
  }

  updateStatus(state) {
    let statusText = state.toUpperCase().replace('_', ' ');
    let color = '#4ade80'; 
    let btnText = "DISARM";
    if (this.mainContainer) this.mainContainer.style.animation = 'none';
    
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
      if (this.mainContainer) this.mainContainer.style.animation = 'triggeredGlow 2s infinite';
    }

    if (this.mainContainer) this.mainContainer.style.setProperty('--status-color', color);
    if (this.statusBadge) this.statusBadge.innerText = statusText;
    if (this.actionBtn) {
        this.actionBtn.innerText = btnText;
        if (btnText.startsWith("ARM")) {
          this.actionBtn.style.background = '#f87171'; 
          this.actionBtn.style.color = '#fff';
        } else {
          this.actionBtn.style.background = '#4ade80'; 
          this.actionBtn.style.color = '#000';
        }
    }
  }

  getCardSize() {
    return 4;
  }
}

try { customElements.define("fullstacksecurity-card", FullStackSecurityCardV16); } catch(e) {}
window.customCards = window.customCards || [];
window.customCards.push({
  type: "fullstacksecurity-card-v15",
  name: "FullStack Security Card V15",
  preview: true,
  description: "A custom card and panel for the FullStack Security plugin."
});"""
        
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
                    "js_url": "/local/fullstacksecurity-card-v16.js?v=1.0.13",
                    "embed_iframe": False,
                    "trust_external": False,
                },
                "entity": f"alarm_control_panel.fullstack_security",
                "config_entry_id": entry.entry_id,
                "sensors": sensors
            },
            require_admin=False,
        )
    except Exception as e:
        _LOGGER.error("Failed to register sidebar panel: %s", e)
        
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)


    # Listen for options updates
    entry.async_on_unload(entry.add_update_listener(async_reload_entry))

    async def handle_update_config(call):
        entity_id = call.data.get("entity_id")
        sensor_type = call.data.get("type")
        action = call.data.get("action")
        
        if not entity_id or not sensor_type or action not in ("add", "remove"):
            return
            
        current_options = dict(entry.options)
        for t in ["doors", "vibration", "sirens", "lights", "buttons"]:
            if t not in current_options:
                current_options[t] = []
                
        if sensor_type not in current_options:
            return
            
        if action == "add":
            if entity_id not in current_options[sensor_type]:
                current_options[sensor_type].append(entity_id)
        elif action == "remove":
            if entity_id in current_options[sensor_type]:
                current_options[sensor_type].remove(entity_id)
                
        hass.config_entries.async_update_entry(entry, options=current_options)
        
    hass.services.async_register(DOMAIN, "update_config", handle_update_config)

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
