/* FullStack Security - sidebar panel (v2.0.0) */
(() => {
  if (customElements.get("fullstacksecurity-panel")) return;

  const LISTS = {
    doors: { title: "Door / Window sensors", icon: "mdi:door" },
    vibration: { title: "Vibration sensors", icon: "mdi:vibrate" },
    flood: { title: "Flood / water leak sensors", icon: "mdi:water-alert" },
    sirens: { title: "Sirens", icon: "mdi:bullhorn" },
    lights: { title: "Alarm lights", icon: "mdi:lightbulb-on" },
    buttons: { title: "Buttons / remotes", icon: "mdi:gesture-double-tap" },
  };

  const STATE_META = {
    disarmed: { label: "DISARMED", icon: "mdi:shield-off-outline", cls: "st-disarmed", btn: "ARM SYSTEM" },
    arming: { label: "ARMING", icon: "mdi:shield-sync-outline", cls: "st-arming", btn: "CANCEL" },
    armed_away: { label: "ARMED AWAY", icon: "mdi:shield-lock", cls: "st-armed", btn: "DISARM" },
    pending: { label: "ENTRY DELAY", icon: "mdi:shield-alert-outline", cls: "st-pending", btn: "DISARM" },
    triggered: { label: "ALARM!", icon: "mdi:alarm-light", cls: "st-triggered", btn: "DISARM" },
  };

  const SETTINGS_FIELDS = [
    "arming_delay", "entry_delay", "siren_duration", "siren_tone",
    "light_mode", "light_duration", "button_single", "button_double",
    "button_triple", "button_hold",
  ];

  class FullStackSecurityPanel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._tab = "dashboard";
      this._dirty = false;
      this._configSig = "";
      this._countdownTimer = null;
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._built) this._build();
      this._update();
    }
    set panel(p) { this._panel = p; }
    set route(r) { this._route = r; }
    set narrow(n) { this._narrow = n; }

    /* ------------------------------------------------------------ helpers */

    _entityId() {
      const states = this._hass.states;
      if (states["alarm_control_panel.fullstack_security"]) {
        return "alarm_control_panel.fullstack_security";
      }
      return Object.keys(states).find(
        (k) => k.startsWith("alarm_control_panel.") &&
          (k.includes("fullstack") || k.includes("full_stack"))
      );
    }

    _alarm() {
      const id = this._entityId();
      return id ? this._hass.states[id] : undefined;
    }

    _attrs() {
      const a = this._alarm();
      return (a && a.attributes) || {};
    }

    _name(entityId) {
      const s = this._hass.states[entityId];
      return (s && s.attributes.friendly_name) || entityId;
    }

    _configured(listKey) {
      return this._attrs()[listKey] || [];
    }

    _candidates(listKey) {
      const taken = new Set(
        Object.keys(LISTS).flatMap((k) => this._configured(k))
      );
      const out = [];
      for (const [id, s] of Object.entries(this._hass.states)) {
        if (taken.has(id)) continue;
        if (id.includes("fullstack_security")) continue; // our own entities
        const domain = id.split(".")[0];
        const dc = s.attributes.device_class || "";
        const hay = (id + " " + (s.attributes.friendly_name || "")).toLowerCase();
        let ok = false;
        switch (listKey) {
          case "doors":
            ok = domain === "binary_sensor" &&
              (["door", "window", "garage_door", "opening"].includes(dc) ||
                (!dc && /door|window|contact/.test(hay)));
            break;
          case "vibration":
            ok = domain === "binary_sensor" &&
              (["vibration", "moving", "motion"].includes(dc) || /vibrat|shake/.test(hay));
            break;
          case "flood":
            ok = domain === "binary_sensor" &&
              (dc === "moisture" || /water|leak|flood|moist/.test(hay));
            break;
          case "sirens":
            ok = domain === "siren" || domain === "switch";
            break;
          case "lights":
            ok = domain === "light";
            break;
          case "buttons":
            ok = domain === "event" ||
              ((domain === "sensor" || domain === "binary_sensor") &&
                /action|button|scene|click/.test(hay));
            break;
        }
        if (ok) out.push(id);
      }
      // Real sirens first, then alphabetical.
      out.sort((a, b) => {
        if (listKey === "sirens") {
          const as = a.startsWith("siren."), bs = b.startsWith("siren.");
          if (as !== bs) return as ? -1 : 1;
        }
        return this._name(a).localeCompare(this._name(b));
      });
      return out;
    }

    _deviceState(listKey, entityId) {
      const s = this._hass.states[entityId];
      if (!s || s.state === "unavailable" || s.state === "unknown") {
        return { text: "UNAVAILABLE", cls: "idle" };
      }
      const on = s.state === "on";
      switch (listKey) {
        case "doors": return on ? { text: "OPEN", cls: "alert" } : { text: "CLOSED", cls: "safe" };
        case "vibration": return on ? { text: "VIBRATION", cls: "alert" } : { text: "CLEAR", cls: "safe" };
        case "flood": return on ? { text: "WET", cls: "water" } : { text: "DRY", cls: "safe" };
        case "sirens": return on ? { text: "SOUNDING", cls: "alert" } : { text: "IDLE", cls: "idle" };
        case "lights": return on ? { text: "ON", cls: "warn" } : { text: "OFF", cls: "idle" };
        case "buttons": {
          if (s.entity_id.startsWith("event.")) {
            const t = s.attributes.event_type;
            return { text: t ? String(t).toUpperCase() : "READY", cls: "idle" };
          }
          return { text: s.state ? s.state.toUpperCase() : "READY", cls: "idle" };
        }
      }
      return { text: s.state.toUpperCase(), cls: "idle" };
    }

    _toast(msg, ok = true) {
      const t = this.$("#toast");
      t.textContent = msg;
      t.className = ok ? "show" : "show err";
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => (t.className = ""), 3500);
    }

    $(sel) { return this.shadowRoot.querySelector(sel); }
    $$(sel) { return [...this.shadowRoot.querySelectorAll(sel)]; }

    /* -------------------------------------------------------------- build */

    _build() {
      this._built = true;
      this.shadowRoot.innerHTML = `
      <style>
        :host {
          --fss-green: var(--success-color, #2e9e5b);
          --fss-amber: var(--warning-color, #f5a623);
          --fss-red: var(--error-color, #e0442c);
          --fss-blue: var(--info-color, #2196f3);
          --fss-card: var(--card-background-color, #fff);
          --fss-radius: var(--ha-card-border-radius, 12px);
          --fss-border: var(--divider-color, rgba(127,127,127,.25));
          display: block;
          height: 100%;
          overflow-y: auto;
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          font-family: var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif);
          -webkit-font-smoothing: antialiased;
        }
        * { box-sizing: border-box; }
        header {
          position: sticky; top: 0; z-index: 10;
          background: var(--app-header-background-color, var(--primary-color));
          color: var(--app-header-text-color, #fff);
          box-shadow: 0 2px 6px rgba(0,0,0,.2);
        }
        .header-top { display: flex; align-items: center; gap: 8px; padding: 10px 16px 4px; }
        .header-top h1 { font-size: 20px; font-weight: 500; margin: 0; flex: 1; display: flex; align-items: center; gap: 10px; }
        #menu-btn {
          background: none; border: none; color: inherit; cursor: pointer;
          padding: 8px; border-radius: 50%; display: flex;
        }
        #menu-btn:hover { background: rgba(255,255,255,.12); }
        .tabs { display: flex; padding: 0 8px; }
        .tabs button {
          background: none; border: none; color: inherit; opacity: .75;
          font: inherit; font-size: 14px; font-weight: 500; text-transform: uppercase;
          letter-spacing: .5px; padding: 12px 18px; cursor: pointer;
          border-bottom: 3px solid transparent;
        }
        .tabs button.active { opacity: 1; border-bottom-color: var(--app-header-text-color, #fff); }
        main { max-width: 860px; margin: 0 auto; padding: 20px 16px 60px; }
        .view { display: none; }
        .view.active { display: block; }
        .card {
          background: var(--fss-card);
          border-radius: var(--fss-radius);
          border: 1px solid var(--fss-border);
          box-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0,0,0,.08));
          padding: 20px;
          margin-bottom: 18px;
        }
        .card h2 {
          margin: 0 0 4px; font-size: 15px; font-weight: 600;
          display: flex; align-items: center; gap: 8px;
          text-transform: uppercase; letter-spacing: .5px;
          color: var(--secondary-text-color);
        }
        .card .hint { font-size: 13px; color: var(--secondary-text-color); margin: 0 0 14px; }

        /* hero */
        .hero { text-align: center; padding: 32px 20px 26px; position: relative; overflow: hidden; }
        .hero::before {
          content: ""; position: absolute; inset: 0 0 auto 0; height: 5px;
          background: var(--st-color, var(--fss-green));
        }
        .hero ha-icon { --mdc-icon-size: 72px; color: var(--st-color, var(--fss-green)); }
        #hero-state {
          font-size: 30px; font-weight: 800; letter-spacing: 2px; margin: 10px 0 4px;
          color: var(--st-color, var(--fss-green));
        }
        #hero-sub { color: var(--secondary-text-color); font-size: 14px; min-height: 20px; }
        #countdown { margin: 18px auto 0; max-width: 340px; }
        #countdown-text { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
        .bar { height: 6px; border-radius: 3px; background: var(--fss-border); overflow: hidden; }
        #bar-fill { height: 100%; width: 0%; background: var(--st-color, var(--fss-amber)); transition: width .25s linear; }
        #main-btn {
          margin-top: 22px; width: 100%; max-width: 340px;
          padding: 16px; font-size: 16px; font-weight: 700; letter-spacing: 1px;
          border: none; border-radius: 12px; cursor: pointer; color: #fff;
          background: var(--st-color, var(--fss-green));
          transition: filter .15s, transform .1s;
        }
        #main-btn:hover { filter: brightness(1.1); }
        #main-btn:active { transform: scale(.98); }
        .st-disarmed { --st-color: var(--fss-green); }
        .st-arming { --st-color: var(--fss-amber); }
        .st-pending { --st-color: var(--fss-amber); }
        .st-armed { --st-color: var(--fss-red); }
        .st-triggered { --st-color: var(--fss-red); }
        .st-triggered ha-icon, .st-triggered #hero-state { animation: blink 1s infinite; }
        @keyframes blink { 50% { opacity: .35; } }

        .banner {
          display: flex; align-items: center; gap: 12px;
          border-radius: var(--fss-radius); padding: 14px 18px; margin-bottom: 18px;
          font-weight: 600; color: #fff; background: var(--fss-blue);
          animation: blink 2s infinite;
        }
        .banner.red { background: var(--fss-red); }
        .banner[hidden] { display: none; }

        /* rows */
        .row {
          display: flex; align-items: center; gap: 12px;
          padding: 11px 4px; border-bottom: 1px solid var(--fss-border);
        }
        .row:last-child { border-bottom: none; }
        .row ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); flex: none; }
        .row .nm { flex: 1; font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .row .eid { display: block; font-size: 11px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; }
        .pill {
          font-size: 11px; font-weight: 700; letter-spacing: .5px;
          padding: 4px 10px; border-radius: 99px; flex: none;
        }
        .pill.safe { color: var(--fss-green); background: color-mix(in srgb, var(--fss-green) 14%, transparent); }
        .pill.alert { color: var(--fss-red); background: color-mix(in srgb, var(--fss-red) 14%, transparent); animation: blink 1.5s infinite; }
        .pill.warn { color: var(--fss-amber); background: color-mix(in srgb, var(--fss-amber) 16%, transparent); }
        .pill.water { color: var(--fss-blue); background: color-mix(in srgb, var(--fss-blue) 14%, transparent); animation: blink 1.5s infinite; }
        .pill.idle { color: var(--secondary-text-color); background: color-mix(in srgb, var(--secondary-text-color) 12%, transparent); }
        .rm {
          background: none; border: none; cursor: pointer; flex: none;
          color: var(--secondary-text-color); padding: 6px; border-radius: 50%;
          display: flex;
        }
        .rm:hover { color: var(--fss-red); background: color-mix(in srgb, var(--fss-red) 12%, transparent); }
        .rm ha-icon { --mdc-icon-size: 18px; color: inherit; }
        .empty { padding: 14px 4px; font-size: 13px; color: var(--secondary-text-color); font-style: italic; }

        /* add row + forms */
        .addrow { display: flex; gap: 10px; margin-top: 14px; }
        select, input[type=number], input[type=text] {
          width: 100%; padding: 10px 12px; font: inherit; font-size: 14px;
          color: var(--primary-text-color);
          background: var(--secondary-background-color, rgba(127,127,127,.08));
          border: 1px solid var(--fss-border); border-radius: 8px; outline: none;
        }
        select:focus, input:focus { border-color: var(--primary-color); }
        .addrow select { flex: 1; }
        .addrow button {
          flex: none; padding: 0 22px; border: none; border-radius: 8px; cursor: pointer;
          font-weight: 700; font-size: 13px; letter-spacing: .5px;
          color: #fff; background: var(--primary-color);
        }
        .addrow button:hover { filter: brightness(1.1); }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } }
        .field label { display: block; font-size: 12px; font-weight: 600; color: var(--secondary-text-color); margin-bottom: 6px; }
        .checkline { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 14px; cursor: pointer; }
        .checkline input { width: auto; accent-color: var(--primary-color); }
        #save-btn {
          position: sticky; bottom: 16px; width: 100%;
          padding: 16px; font-size: 15px; font-weight: 700; letter-spacing: 1px;
          border: none; border-radius: 12px; cursor: pointer; color: #fff;
          background: var(--fss-green); box-shadow: 0 4px 14px rgba(0,0,0,.25);
        }
        #save-btn:hover { filter: brightness(1.1); }

        #toast {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(80px);
          background: #323232; color: #fff; padding: 12px 24px; border-radius: 8px;
          font-size: 14px; opacity: 0; transition: all .25s; z-index: 100; pointer-events: none;
          max-width: 90vw;
        }
        #toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
        #toast.err { background: var(--fss-red); }
        .missing { text-align: center; padding: 40px 20px; color: var(--secondary-text-color); }
      </style>

      <header>
        <div class="header-top">
          <button id="menu-btn" title="Menu"><ha-icon icon="mdi:menu"></ha-icon></button>
          <h1><ha-icon icon="mdi:shield-home"></ha-icon> Security</h1>
        </div>
        <div class="tabs">
          <button data-tab="dashboard" class="active">Dashboard</button>
          <button data-tab="devices">Devices</button>
          <button data-tab="settings">Settings</button>
        </div>
      </header>

      <main>
        <div id="missing" class="missing" hidden>
          FullStack Security entity not found. Make sure the integration is set up
          (Settings &rarr; Devices &amp; Services) and check the Home Assistant logs.
        </div>

        <div class="view active" id="view-dashboard">
          <div id="flood-banner" class="banner" hidden>
            <ha-icon icon="mdi:water-alert"></ha-icon><span id="flood-banner-text"></span>
          </div>
          <section class="card hero st-disarmed" id="hero">
            <ha-icon id="hero-icon" icon="mdi:shield-off-outline"></ha-icon>
            <div id="hero-state">&nbsp;</div>
            <div id="hero-sub"></div>
            <div id="countdown" hidden>
              <div id="countdown-text"></div>
              <div class="bar"><div id="bar-fill"></div></div>
            </div>
            <button id="main-btn">ARM SYSTEM</button>
          </section>
          <section class="card">
            <h2><ha-icon icon="mdi:motion-sensor"></ha-icon> Live sensors</h2>
            <div id="sensor-grid"></div>
          </section>
        </div>

        <div class="view" id="view-devices">
          ${Object.entries(LISTS).map(([key, meta]) => `
            <section class="card">
              <h2><ha-icon icon="${meta.icon}"></ha-icon> ${meta.title}</h2>
              <div data-devlist="${key}"></div>
              <div class="addrow">
                <select data-addsel="${key}"><option value="">Select an entity…</option></select>
                <button data-addbtn="${key}">ADD</button>
              </div>
            </section>`).join("")}
        </div>

        <div class="view" id="view-settings">
          <section class="card">
            <h2><ha-icon icon="mdi:timer-outline"></ha-icon> Timing</h2>
            <p class="hint">Exit delay gives you time to leave. Entry delay gives you time to disarm before the sirens fire.</p>
            <div class="grid2">
              <div class="field"><label>Exit delay (seconds)</label><input type="number" min="0" id="f-arming_delay"></div>
              <div class="field"><label>Entry delay (seconds)</label><input type="number" min="0" id="f-entry_delay"></div>
            </div>
          </section>

          <section class="card">
            <h2><ha-icon icon="mdi:bullhorn"></ha-icon> Alarm response</h2>
            <div class="grid2">
              <div class="field"><label>Siren tone</label><select id="f-siren_tone"><option value="">Default</option></select></div>
              <div class="field"><label>Siren duration (seconds, 0 = until disarmed)</label><input type="number" min="0" id="f-siren_duration"></div>
              <div class="field"><label>Light action</label>
                <select id="f-light_mode">
                  <option value="flash_long">Flash (long)</option>
                  <option value="flash_short">Flash (short)</option>
                  <option value="solid_red">Solid red</option>
                  <option value="solid_white">Solid white</option>
                </select>
              </div>
              <div class="field"><label>Light duration (seconds, 0 = until disarmed)</label><input type="number" min="0" id="f-light_duration"></div>
            </div>
          </section>

          <section class="card">
            <h2><ha-icon icon="mdi:water-alert"></ha-icon> Flood protection</h2>
            <p class="hint">Flood sensors are monitored 24/7, even when the system is disarmed. Alerts always go to your phones.</p>
            <label class="checkline"><input type="checkbox" id="f-flood_siren"> Sound the sirens on a water leak</label>
          </section>

          <section class="card">
            <h2><ha-icon icon="mdi:gesture-double-tap"></ha-icon> Button actions</h2>
            <div class="grid2">
              ${["single", "double", "triple", "hold"].map((p) => `
                <div class="field"><label>${p[0].toUpperCase() + p.slice(1)} press</label>
                  <select id="f-button_${p}">
                    <option value="arm">Arm system</option>
                    <option value="disarm">Disarm system</option>
                    <option value="toggle">Toggle arm/disarm</option>
                    <option value="none">Do nothing</option>
                  </select>
                </div>`).join("")}
            </div>
          </section>

          <section class="card">
            <h2><ha-icon icon="mdi:cellphone-message"></ha-icon> Phone notifications</h2>
            <p class="hint">Sent when the alarm triggers, a leak is detected, or arming fails.</p>
            <div id="notify-list"></div>
          </section>

          <button id="save-btn">SAVE SETTINGS</button>
        </div>
      </main>
      <div id="toast"></div>`;

      this._attachHandlers();
    }

    _attachHandlers() {
      this.$("#menu-btn").addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }));
      });

      this.$$(".tabs button").forEach((b) =>
        b.addEventListener("click", () => this._switchTab(b.dataset.tab))
      );

      this.$("#main-btn").addEventListener("click", () => this._mainAction());

      // Devices view: add / remove via delegation.
      this.$("#view-devices").addEventListener("click", (e) => {
        const rm = e.target.closest("[data-remove]");
        if (rm) {
          const id = rm.dataset.remove;
          if (confirm(`Remove ${this._name(id)} from the system?`)) {
            this._hass.callService("fullstacksecurity", "update_config", {
              action: "remove", type: rm.dataset.list, entity_id: id,
            });
            this._toast(`Removed ${this._name(id)}`);
          }
          return;
        }
        const add = e.target.closest("[data-addbtn]");
        if (add) {
          const key = add.dataset.addbtn;
          const sel = this.$(`[data-addsel="${key}"]`);
          if (!sel.value) return this._toast("Pick an entity first", false);
          this._hass.callService("fullstacksecurity", "update_config", {
            action: "add", type: key, entity_id: sel.value,
          });
          this._toast(`Added ${this._name(sel.value)}`);
          sel.value = "";
        }
      });

      this.$("#view-settings").addEventListener("change", () => { this._dirty = true; });
      this.$("#view-settings").addEventListener("input", () => { this._dirty = true; });
      this.$("#save-btn").addEventListener("click", () => this._saveSettings());
    }

    _switchTab(tab) {
      this._tab = tab;
      this.$$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
      this.$$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${tab}`));
      if (tab === "devices") this._refreshAddSelects(true);
      if (tab === "settings" && !this._dirty) this._populateSettings();
    }

    /* ------------------------------------------------------------- actions */

    _mainAction() {
      const alarm = this._alarm();
      if (!alarm) return;
      if (alarm.state === "disarmed") {
        const open = (alarm.attributes.open_sensors || []);
        if (open.length) {
          this._toast(`Cannot arm — open: ${open.map((e) => this._name(e)).join(", ")}`, false);
          return;
        }
        this._hass.callService("alarm_control_panel", "alarm_arm_away", { entity_id: alarm.entity_id });
      } else {
        this._hass.callService("alarm_control_panel", "alarm_disarm", { entity_id: alarm.entity_id });
      }
    }

    _saveSettings() {
      const data = { action: "settings" };
      for (const f of SETTINGS_FIELDS) {
        const el = this.$(`#f-${f}`);
        let v = el.value;
        if (el.type === "number") v = Math.max(0, parseInt(v, 10) || 0);
        data[f] = v;
      }
      data.flood_siren = this.$("#f-flood_siren").checked;
      data.notify_services = this.$$("#notify-list input:checked").map((c) => c.value);

      this._hass
        .callService("fullstacksecurity", "update_config", data)
        .then(() => {
          this._dirty = false;
          this._toast("Settings saved ✓");
        })
        .catch((err) => this._toast(`Save failed: ${err.message || err}`, false));
    }

    /* -------------------------------------------------------------- render */

    _update() {
      if (!this._built || !this._hass) return;
      const alarm = this._alarm();
      this.$("#missing").hidden = !!alarm;
      this.$$("main .view").forEach((v) => (v.style.display = alarm ? "" : "none"));
      if (!alarm) return;

      this._renderHero(alarm);
      this._renderFloodBanner();
      this._renderSensorGrid();

      const sig = JSON.stringify(Object.keys(LISTS).map((k) => this._configured(k)));
      const cfgChanged = sig !== this._configSig;
      this._configSig = sig;

      this._renderDeviceLists();
      if (cfgChanged) {
        this._refreshAddSelects(false);
        if (!this._dirty) this._populateSettings();
      }
    }

    _renderHero(alarm) {
      const meta = STATE_META[alarm.state] ||
        { label: alarm.state.toUpperCase(), icon: "mdi:shield", cls: "st-disarmed", btn: "DISARM" };
      const hero = this.$("#hero");
      hero.className = `card hero ${meta.cls}`;
      this.$("#hero-icon").setAttribute("icon", meta.icon);
      this.$("#hero-state").textContent = meta.label;
      this.$("#main-btn").textContent = meta.btn;

      const a = alarm.attributes;
      const secCount = (a.doors || []).length + (a.vibration || []).length;
      const open = a.open_sensors || [];
      let sub = "";
      if (alarm.state === "disarmed") {
        sub = open.length
          ? `Open now: ${open.map((e) => this._name(e)).join(", ")}`
          : `Ready — ${secCount} sensor${secCount === 1 ? "" : "s"} closed`;
      } else if (alarm.state === "armed_away") {
        sub = `Monitoring ${secCount} sensor${secCount === 1 ? "" : "s"}`;
      } else if (alarm.state === "arming") {
        sub = "Exit now — arming shortly";
      } else if (alarm.state === "pending") {
        sub = `Opened: ${a.last_triggered_by ? this._name(a.last_triggered_by) : "sensor"} — disarm now!`;
      } else if (alarm.state === "triggered") {
        sub = a.last_triggered_by && a.last_triggered_by !== "manual"
          ? `Triggered by ${this._name(a.last_triggered_by)}`
          : "Alarm triggered";
      }
      this.$("#hero-sub").textContent = sub;

      this._manageCountdown(alarm);
    }

    _manageCountdown(alarm) {
      const active = (alarm.state === "arming" || alarm.state === "pending") &&
        alarm.attributes.delay_ends_at;
      const box = this.$("#countdown");
      if (!active) {
        box.hidden = true;
        this._countdownKey = null;
        if (this._countdownTimer) { clearInterval(this._countdownTimer); this._countdownTimer = null; }
        return;
      }
      box.hidden = false;
      const key = `${alarm.state}|${alarm.attributes.delay_ends_at}`;
      if (key === this._countdownKey) return;
      this._countdownKey = key;
      if (this._countdownTimer) clearInterval(this._countdownTimer);

      const ends = new Date(alarm.attributes.delay_ends_at).getTime();
      const total = (alarm.attributes.delay_total || 30) * 1000;
      const verb = alarm.state === "arming" ? "Armed in" : "Alarm in";
      const tick = () => {
        const left = Math.max(0, ends - Date.now());
        this.$("#countdown-text").textContent = `${verb} ${Math.ceil(left / 1000)}s`;
        this.$("#bar-fill").style.width = `${Math.min(100, 100 - (left / total) * 100)}%`;
      };
      tick();
      this._countdownTimer = setInterval(tick, 250);
    }

    _renderFloodBanner() {
      const flood = Object.values(this._hass.states).find(
        (s) => s.entity_id.startsWith("binary_sensor.") &&
          s.attributes.friendly_name === "FullStack Security Flood Alert"
      ) || this._hass.states["binary_sensor.fullstack_security_flood_alert"];
      const banner = this.$("#flood-banner");
      const wet = flood && flood.state === "on" ? (flood.attributes.wet_sensors || []) : [];
      banner.hidden = wet.length === 0;
      if (wet.length) {
        this.$("#flood-banner-text").textContent =
          `WATER LEAK DETECTED — ${wet.map((e) => this._name(e)).join(", ")}`;
      }
    }

    _rowHtml(listKey, entityId, removable) {
      const st = this._deviceState(listKey, entityId);
      return `
        <div class="row">
          <ha-icon icon="${LISTS[listKey].icon}"></ha-icon>
          <span class="nm">${this._name(entityId)}<span class="eid">${entityId}</span></span>
          <span class="pill ${st.cls}">${st.text}</span>
          ${removable ? `<button class="rm" title="Remove" data-remove="${entityId}" data-list="${listKey}"><ha-icon icon="mdi:close"></ha-icon></button>` : ""}
        </div>`;
    }

    _renderSensorGrid() {
      const grid = this.$("#sensor-grid");
      let html = "";
      for (const key of ["doors", "vibration", "flood"]) {
        html += this._configured(key).map((e) => this._rowHtml(key, e, false)).join("");
      }
      grid.innerHTML = html ||
        `<div class="empty">No sensors yet — add door, vibration and flood sensors in the Devices tab.</div>`;
    }

    _renderDeviceLists() {
      for (const key of Object.keys(LISTS)) {
        const el = this.$(`[data-devlist="${key}"]`);
        const items = this._configured(key);
        el.innerHTML = items.length
          ? items.map((e) => this._rowHtml(key, e, true)).join("")
          : `<div class="empty">Nothing added yet.</div>`;
      }
    }

    _refreshAddSelects(force) {
      for (const key of Object.keys(LISTS)) {
        const sel = this.$(`[data-addsel="${key}"]`);
        if (!force && document.activeElement === sel) continue;
        const prev = sel.value;
        const opts = this._candidates(key)
          .map((e) => `<option value="${e}">${this._name(e)} (${e})</option>`)
          .join("");
        sel.innerHTML = `<option value="">Select an entity…</option>` + opts;
        if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
      }
    }

    _populateSettings() {
      const a = this._attrs();
      const set = (id, v) => { const el = this.$(id); if (el) el.value = v; };
      set("#f-arming_delay", a.arming_delay ?? 30);
      set("#f-entry_delay", a.entry_delay ?? 30);
      set("#f-siren_duration", a.siren_duration ?? 300);
      set("#f-light_mode", a.light_mode || "flash_long");
      set("#f-light_duration", a.light_duration ?? 0);
      set("#f-button_single", a.button_single || "arm");
      set("#f-button_double", a.button_double || "disarm");
      set("#f-button_triple", a.button_triple || "none");
      set("#f-button_hold", a.button_hold || "none");
      this.$("#f-flood_siren").checked = a.flood_siren !== false;

      // Siren tones from the configured sirens.
      const tones = new Set();
      (a.sirens || []).forEach((s) => {
        const t = this._hass.states[s]?.attributes?.available_tones;
        if (Array.isArray(t)) {
          t.forEach((x) => tones.add(typeof x === "object" ? (x.name || x.id) : x));
        }
      });
      const toneSel = this.$("#f-siren_tone");
      toneSel.innerHTML = `<option value="">Default</option>` +
        [...tones].filter(Boolean).map((t) => `<option value="${t}">${t}</option>`).join("");
      toneSel.value = tones.has(a.siren_tone) ? a.siren_tone : "";

      // Notify services.
      const chosen = new Set(a.notify_services || []);
      const services = Object.keys(this._hass.services.notify || {})
        .filter((s) => s !== "persistent_notification" && s !== "send_message")
        .sort((x, y) => {
          const xm = x.startsWith("mobile_app"), ym = y.startsWith("mobile_app");
          return xm === ym ? x.localeCompare(y) : (xm ? -1 : 1);
        });
      this.$("#notify-list").innerHTML = services.length
        ? services.map((s) => `
            <label class="checkline">
              <input type="checkbox" value="notify.${s}" ${chosen.has(`notify.${s}`) ? "checked" : ""}>
              ${s.startsWith("mobile_app_") ? "📱 " + s.replace("mobile_app_", "").replace(/_/g, " ") : s}
            </label>`).join("")
        : `<div class="empty">No notify services found. Install the Home Assistant companion app on your phone.</div>`;
    }
  }

  customElements.define("fullstacksecurity-panel", FullStackSecurityPanel);
})();
