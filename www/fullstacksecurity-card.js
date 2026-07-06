class FullStackSecurityCard extends HTMLElement {
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
      this.content = this.querySelector('.card-content');
      this.statusEl = this.querySelector('#status');
      this.sensorsEl = this.querySelector('#sensors');
      this.actionBtn = this.querySelector('#action-btn');
      
      this.actionBtn.addEventListener('click', () => {
        if (this._state === 'disarmed') {
          this._hass.callService('alarm_control_panel', 'alarm_arm_away', {
            entity_id: this.config.entity
          });
        } else {
          this._hass.callService('alarm_control_panel', 'alarm_disarm', {
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
    
    // Also display the configured sensors if provided in card config
    if (this.config.sensors && Array.isArray(this.config.sensors)) {
      let sensorsHtml = '';
      this.config.sensors.forEach(sensorId => {
        const sensorObj = hass.states[sensorId];
        if (sensorObj) {
          const name = sensorObj.attributes.friendly_name || sensorId;
          const state = sensorObj.state;
          const lastUpdated = new Date(sensorObj.last_updated).toLocaleTimeString();
          
          let color = 'var(--primary-text-color)';
          if (state === 'on') color = 'var(--error-color)'; // Open / Vibrating
          else if (state === 'off') color = 'var(--success-color)'; // Closed / Still
          
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
    let statusText = state.toUpperCase().replace('_', ' ');
    let color = 'var(--label-badge-green)';
    let btnText = "DISARM";
    
    if (state === 'disarmed') {
      color = 'var(--label-badge-green)';
      btnText = "ARM";
    } else if (state === 'arming') {
      color = 'var(--label-badge-yellow)';
      statusText = "ARMING (30s)";
    } else if (state === 'armed_away') {
      color = 'var(--label-badge-red)';
    } else if (state === 'triggered') {
      color = 'var(--error-color)';
      statusText = "TRIGGERED!";
    }

    this.statusEl.innerHTML = `<span style="color: ${color};">${statusText}</span>`;
    this.actionBtn.innerText = btnText;
    
    // Style the button based on action
    if (btnText === "ARM") {
      this.actionBtn.style.setProperty('--mdc-theme-primary', 'var(--label-badge-red)');
    } else {
      this.actionBtn.style.setProperty('--mdc-theme-primary', 'var(--label-badge-green)');
    }
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('You need to define an entity (the alarm_control_panel)');
    }
    this.config = config;
  }

  getCardSize() {
    return 4;
  }
}

customElements.define('fullstacksecurity-card', FullStackSecurityCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "fullstacksecurity-card",
  name: "FullStack Security Card",
  preview: true,
  description: "A custom card for the FullStack Security plugin."
});
