/* FullStack Security - sidebar panel/card (v2.14.0) */
(() => {
  const LISTS = {
    doors: { title: "Door / Window sensors", icon: "mdi:door" },
    vibration: { title: "Vibration sensors", icon: "mdi:vibrate" },
    flood: { title: "Flood / water leak sensors", icon: "mdi:water-alert" },
    sirens: { title: "Sirens", icon: "mdi:bullhorn" },
    lights: { title: "Lights", icon: "mdi:lightbulb-group" },
    buttons: { title: "Buttons / remotes", icon: "mdi:gesture-double-tap" },
  };

  const STATE_META = {
    disarmed: { label: "DISARMED", icon: "mdi:shield-off-outline", cls: "st-disarmed", btn: "ARM SYSTEM" },
    arming: { label: "ARMING", icon: "mdi:shield-sync-outline", cls: "st-arming", btn: "CANCEL" },
    armed_away: { label: "ARMED AWAY", icon: "mdi:shield-lock", cls: "st-armed", btn: "DISARM" },
    pending: { label: "ENTRY DELAY", icon: "mdi:shield-alert-outline", cls: "st-pending", btn: "DISARM" },
    triggered: { label: "ALARM!", icon: "mdi:alarm-light", cls: "st-triggered", btn: "DISARM" },
  };

  const HISTORY_ICONS = {
    shield: "mdi:shield-check", "shield-off": "mdi:shield-off-outline",
    alarm: "mdi:alarm-light", water: "mdi:water-alert",
    clock: "mdi:clock-outline", alert: "mdi:alert",
  };

  const DAYS = [
    ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"],
    ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
  ];

  const SETTINGS_FIELDS = [
    "arming_delay", "entry_delay", "siren_duration",
    "light_mode", "light_duration", "button_single", "button_double",
    "button_triple", "button_hold",
  ];
  const CONFIG_ATTRS = [
    ...Object.keys(LISTS), "mqtt_buttons", "device_names", "device_zones",
    "siren_tone", "siren_tones", ...SETTINGS_FIELDS, "siren_volume",
    "armed_light_color", "disarmed_light_color", "disarmed_lights_on",
    "arming_flash", "flood_siren", "notify_services",
    "notify_arm_disarm", "critical_alerts", "schedules_enabled", "schedules",
    "health_check_enabled", "health_check_times", "health_battery_threshold",
  ];

  // Shared status pill logic used by both the sidebar panel and the card.
  function computeDeviceState(hass, listKey, entityId) {
    const s = hass && hass.states ? hass.states[entityId] : undefined;
    if (!s || s.state === "unavailable") {
      // Doors/vibration/flood offline is a security hole (red); a siren, light
      // or button offline still needs attention (amber), never a silent grey.
      const critical = ["doors", "vibration", "flood"].includes(listKey);
      return { text: "OFFLINE", cls: critical ? "alert static" : "warn" };
    }
    if (s.state === "unknown" || s.state === "") {
      return listKey === "buttons"
        ? { text: "READY", cls: "idle" }
        : { text: "NO DATA", cls: "warn" };
    }
    const st = String(s.state).trim().toLowerCase();
    const on = ["on", "true", "1", "active", "playing", "open"].includes(st);
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
    return { text: String(s.state).toUpperCase(), cls: "idle" };
  }

  function isButtonDiagnostic(entityId, deviceClass) {
    return /_battery|_linkquality|_voltage|_temperature|_humidity|_power|_energy|_update|_identify|_illuminance|backup/.test(entityId) ||
      ["battery", "voltage", "temperature", "humidity", "signal_strength",
        "power", "energy", "illuminance", "timestamp"].includes(deviceClass);
  }

  function isCandidateForList(listKey, entityId, state, conservative = false) {
    if (!state || entityId.includes("fullstack_security")) return false;
    const domain = entityId.split(".")[0];
    const deviceClass = state.attributes.device_class || "";
    const haystack = (entityId + " " + (state.attributes.friendly_name || "")).toLowerCase();
    switch (listKey) {
      case "doors":
        return domain === "binary_sensor" &&
          (["door", "window", "garage_door", "opening"].includes(deviceClass) ||
            (!deviceClass && /door|window|contact/.test(haystack)));
      case "vibration":
        return domain === "binary_sensor" &&
          (["vibration", "moving", "motion", "occupancy"].includes(deviceClass) ||
            /vibrat|shake|motion|occupancy/.test(haystack));
      case "flood":
        return domain === "binary_sensor" &&
          (deviceClass === "moisture" || /water|leak|flood|moist/.test(haystack));
      case "sirens":
        return domain === "siren" || domain === "switch";
      case "lights":
        return domain === "light";
      case "buttons":
        if (isButtonDiagnostic(entityId, deviceClass)) return false;
        if (!conservative) {
          return ["event", "sensor", "binary_sensor", "button", "input_button"].includes(domain);
        }
        return ["event", "button", "input_button"].includes(domain) ||
          (["sensor", "binary_sensor"].includes(domain) && /action|button|remote|switch/.test(haystack));
      default:
        return false;
    }
  }

  function toneOptions(availableTones) {
    if (Array.isArray(availableTones)) {
      return availableTones.map((tone) => {
        if (tone && typeof tone === "object") {
          const value = tone.id || tone.value || tone.name;
          return value ? { value: String(value), label: String(tone.name || value) } : null;
        }
        return tone ? { value: String(tone), label: String(tone) } : null;
      }).filter(Boolean);
    }
    if (availableTones && typeof availableTones === "object") {
      return Object.entries(availableTones).map(([value, label]) => ({
        value: String(value),
        label: String(label || value),
      }));
    }
    return [];
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
    }[char]));
  }

  function sirenControlScore(sirenId, sirenState, controlId, controlState) {
    const controlText = `${controlId} ${controlState.attributes.friendly_name || ""}`.toLowerCase();
    if (!/alarm|sound|tone|melody|ring|chime|siren/.test(controlText)) return 0;
    const ignored = new Set([
      "alarm", "sound", "tone", "melody", "ring", "ringtone", "chime",
      "siren", "mode", "select", "control", "device", "zigbee",
    ]);
    const tokens = (value) => new Set(String(value).toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2 && !ignored.has(token)));
    const sirenTokens = tokens(`${sirenId} ${sirenState.attributes.friendly_name || ""}`);
    const controlTokens = tokens(controlText);
    let score = 0;
    for (const token of sirenTokens) {
      if (controlTokens.has(token)) score += 2;
    }
    const sirenObject = (sirenId.split(".")[1] || "").toLowerCase();
    if (sirenObject.length > 3 && controlText.includes(sirenObject)) score += 3;
    return score;
  }

  class FullStackSecurityPanel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._tab = "dashboard";
      this._dirty = false;
      this._schDirty = false;
      this._configSig = "";
      this._countdownTimer = null;
      this._areaZones = {};
      this._entityRegistry = [];
      this._areaZonesLoaded = false;
      this._areaZonesPromise = null;
      this._discoveredDevices = [];
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._built) this._build();
      this._update();
      if (!this._areaZonesLoaded && !this._areaZonesPromise) {
        this._loadAreaZones().then(() => {
          this._update();
          if (this._tab === "settings") this._renderSirenControls();
        });
      }
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
      const names = this._attrs().device_names || {};
      return names[entityId] || (s && s.attributes.friendly_name) || entityId;
    }

    _configured(listKey) {
      return this._attrs()[listKey] || [];
    }

    _zoneFor(entityId) {
      return this._areaZones[entityId] ||
        (this._attrs().device_zones || {})[entityId] || "Unassigned";
    }

    _ws(message) {
      if (this._hass.callWS) return this._hass.callWS(message);
      return this._hass.connection.sendMessagePromise(message);
    }

    async _loadAreaZones() {
      if (this._areaZonesLoaded) return this._areaZones;
      if (this._areaZonesPromise) return this._areaZonesPromise;
      this._areaZonesPromise = (async () => {
        try {
          const [entities, devices, areas] = await Promise.all([
            this._ws({ type: "config/entity_registry/list" }),
            this._ws({ type: "config/device_registry/list" }),
            this._ws({ type: "config/area_registry/list" }),
          ]);
          const areaNames = new Map((areas || []).map((area) => [
            area.area_id || area.id,
            area.name,
          ]));
          const deviceAreas = new Map((devices || []).map((device) => [
            device.id,
            device.area_id,
          ]));
          this._entityRegistry = Array.isArray(entities) ? entities : [];
          this._areaZones = Object.fromEntries(this._entityRegistry.flatMap((entity) => {
            const areaId = entity.area_id || deviceAreas.get(entity.device_id);
            const zone = areaNames.get(areaId);
            return entity.entity_id && zone ? [[entity.entity_id, zone]] : [];
          }));
          this._areaZonesLoaded = true;
        } catch (err) {
          // A non-admin dashboard user may not have registry read access.
          // Discovery still works; those devices are simply Unassigned.
          console.debug("FullStack Security could not load HA areas", err);
        } finally {
          this._areaZonesLoaded = true;
          this._areaZonesPromise = null;
        }
        return this._areaZones;
      })();
      return this._areaZonesPromise;
    }

    _candidates(listKey) {
      const taken = new Set(
        Object.keys(LISTS).flatMap((k) => this._configured(k))
      );
      const out = [];
      for (const [id, s] of Object.entries(this._hass.states)) {
        if (taken.has(id)) continue;
        if (id.includes("fullstack_security")) continue; // our own entities
        if (isCandidateForList(listKey, id, s)) out.push(id);
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
      return computeDeviceState(this._hass, listKey, entityId);
    }

    _batteryFor(entityId) {
      const s = this._hass.states[entityId];
      if (!s) return null;
      const a = s.attributes;
      if (typeof a.battery === "number") return a.battery;
      if (typeof a.battery_level === "number") return a.battery_level;
      const obj = entityId.split(".")[1] || "";
      const bases = new Set([
        obj,
        obj.replace(/_(contact|action|vibration|occupancy|water_leak|moisture|state|opening|button)$/, ""),
      ]);
      for (const b of bases) {
        const c = this._hass.states[`sensor.${b}_battery`];
        if (c && !isNaN(parseFloat(c.state))) return parseFloat(c.state);
      }
      return null;
    }

    _lqiFor(entityId) {
      const s = this._hass.states[entityId];
      if (!s) return null;
      if (typeof s.attributes.linkquality === "number") return s.attributes.linkquality;
      const obj = entityId.split(".")[1] || "";
      const bases = new Set([
        obj,
        obj.replace(/_(contact|action|vibration|occupancy|water_leak|moisture|state|opening|button)$/, ""),
      ]);
      for (const b of bases) {
        const c = this._hass.states[`sensor.${b}_linkquality`];
        if (c && !isNaN(parseFloat(c.state))) return parseFloat(c.state);
      }
      return null;
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
        .tabs { display: flex; padding: 0 8px; overflow-x: auto; scrollbar-width: none; }
        .tabs::-webkit-scrollbar { display: none; }
        .tabs button {
          background: none; border: none; color: inherit; opacity: .75; flex: none;
          font: inherit; font-size: 14px; font-weight: 500; text-transform: uppercase;
          letter-spacing: .5px; padding: 12px 16px; cursor: pointer;
          border-bottom: 3px solid transparent; white-space: nowrap;
        }
        .tabs button.active { opacity: 1; border-bottom-color: var(--app-header-text-color, #fff); }
        .tabs button ha-icon { --mdc-icon-size: 15px; margin-right: 6px; vertical-align: -2px; }
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

        /* collapsible cards (Devices + Settings) */
        details.acc { padding: 0; }
        details.acc > summary {
          display: flex; align-items: center; gap: 10px;
          padding: 16px 20px; cursor: pointer; list-style: none; user-select: none;
        }
        details.acc > summary::-webkit-details-marker { display: none; }
        details.acc > summary > ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); flex: none; }
        .acc-title { flex: none; font-size: 14px; font-weight: 600; }
        .acc-sub {
          flex: 1; min-width: 0; font-size: 12px; color: var(--secondary-text-color);
          text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .acc-sub .alerttext { color: var(--fss-red); font-weight: 700; }
        .acc-sub .warntext { color: var(--fss-amber); font-weight: 700; }
        .acc-sub .oktext { color: var(--fss-green); font-weight: 600; }
        .acc-sub .dot { display:inline-block; width:10px; height:10px; border-radius:50%; vertical-align:-1px; margin-left:2px; }
        details.acc > summary .chev { transition: transform .2s; color: var(--secondary-text-color); }
        details.acc[open] > summary .chev { transform: rotate(180deg); }
        details.acc > .acc-body { padding: 0 20px 20px; }

        /* dashboard system-devices strip */
        .strip-row {
          display: flex; align-items: center; gap: 12px;
          padding: 11px 4px; border-bottom: 1px solid var(--fss-border); cursor: pointer;
        }
        .strip-row:last-child { border-bottom: none; }
        .strip-row:hover .nm { color: var(--primary-color); }
        .strip-row ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); flex: none; }
        .strip-row .nm { flex: 1; min-width: 0; font-size: 14px; }
        .strip-row .eid { display: block; font-size: 11px; color: var(--secondary-text-color); }
        .linkbtn {
          background: none; border: none; color: var(--primary-color); cursor: pointer;
          font: inherit; font-size: 13px; font-weight: 600; padding: 10px 4px 0;
        }

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
        #countdown[hidden] { display: none; }
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
        #main-btn:disabled { opacity: .4; cursor: not-allowed; filter: none; transform: none; }
        #ready-box { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 14px; }
        #ready-box[hidden] { display: none; }
        .ready-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 99px; font-size: 12px; font-weight: 700;
          color: var(--fss-red); background: color-mix(in srgb, var(--fss-red) 13%, transparent);
        }
        .ready-chip.good { color: var(--fss-green); background: color-mix(in srgb, var(--fss-green) 13%, transparent); }
        .ready-chip.warn { color: var(--fss-amber); background: color-mix(in srgb, var(--fss-amber) 15%, transparent); }
        .ready-chip ha-icon { --mdc-icon-size: 15px; color: inherit; }
        .group-label {
          font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase;
          color: var(--secondary-text-color); padding: 12px 4px 2px;
        }
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
        .pill.static { animation: none; }
        .rm {
          background: none; border: none; cursor: pointer; flex: none;
          color: var(--secondary-text-color); padding: 6px; border-radius: 50%;
          display: flex;
        }
        .rm:hover { color: var(--fss-red); background: color-mix(in srgb, var(--fss-red) 12%, transparent); }
        .rm ha-icon { --mdc-icon-size: 18px; color: inherit; }
        .empty { padding: 14px 4px; font-size: 13px; color: var(--secondary-text-color); font-style: italic; }

        /* history */
        .hist-row { display: flex; align-items: center; gap: 12px; padding: 8px 4px; border-bottom: 1px solid var(--fss-border); font-size: 13px; }
        .hist-row:last-child { border-bottom: none; }
        .hist-row ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); flex: none; }
        .hist-row .when { color: var(--secondary-text-color); font-size: 12px; flex: none; width: 118px; }
        .hist-row .what { flex: 1; }

        /* add row + forms */
        .addrow { display: flex; gap: 10px; margin-top: 14px; }
        select, input[type=number], input[type=text], input[type=time] {
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
        .addrow input { flex: 1; }
        .add-btn {
          width: 100%; padding: 12px; border: 1px solid var(--fss-border);
          border-radius: 8px; cursor: pointer; font: inherit; font-size: 13px;
          font-weight: 700; letter-spacing: .3px;
          color: var(--primary-color); background: transparent;
        }
        .add-btn:hover { background: color-mix(in srgb, var(--primary-color) 10%, transparent); }
        .discover-card { display: flex; align-items: center; gap: 14px; }
        .discover-card ha-icon { --mdc-icon-size: 28px; color: var(--primary-color); flex: none; }
        .discover-card .discover-copy { flex: 1; min-width: 0; }
        .discover-card h2 { margin-bottom: 4px; }
        .discover-card .hint { margin: 0; }
        .discover-card .add-btn { width: auto; flex: none; padding: 12px 16px; }
        #discovery-results[hidden] { display: none; }
        .discovery-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
        .discovery-head h2 { flex: 1; margin: 0; }
        .discovery-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--fss-border); cursor: pointer; }
        .discovery-row input { width: auto; accent-color: var(--primary-color); flex: none; }
        .discovery-row ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); flex: none; }
        .discovery-row .nm { flex: 1; min-width: 0; font-size: 14px; }
        .discovery-row .eid { display: block; font-size: 11px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; }
        .discovery-row .kind { font-size: 11px; color: var(--secondary-text-color); text-transform: uppercase; flex: none; }
        .discovery-actions { display: flex; gap: 10px; margin-top: 14px; }
        .discovery-actions .add-btn { flex: 1; }
        .edit { background: none; border: none; cursor: pointer; flex: none; color: var(--secondary-text-color); padding: 6px; border-radius: 50%; display: flex; }
        .edit:hover { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 12%, transparent); }
        .edit ha-icon { --mdc-icon-size: 18px; color: inherit; }
        .siren-control { padding: 14px 0; border-bottom: 1px solid var(--fss-border); }
        .siren-control:last-child { border-bottom: none; padding-bottom: 0; }
        .siren-name { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; margin-bottom: 10px; }
        .siren-name ha-icon { --mdc-icon-size: 18px; color: var(--primary-color); }
        .siren-note { font-size: 12px; color: var(--secondary-text-color); margin: 8px 0 0; }
        @media (max-width: 560px) {
          .discover-card { align-items: flex-start; flex-wrap: wrap; }
          .discover-card .add-btn { width: 100%; }
        }
        .mqtt-block {
          margin-top: 16px; padding: 14px; border-radius: 10px;
          border: 1px solid var(--fss-border);
          background: color-mix(in srgb, var(--primary-color) 6%, transparent);
        }
        .mqtt-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; font-weight: 700; margin-bottom: 6px;
        }
        .mqtt-title ha-icon { --mdc-icon-size: 18px; color: var(--primary-color); }
        details.adv { margin-top: 12px; }
        details.adv summary {
          cursor: pointer; font-size: 12px; color: var(--secondary-text-color);
          user-select: none; padding: 4px 0;
        }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } }
        .field label { display: block; font-size: 12px; font-weight: 600; color: var(--secondary-text-color); margin-bottom: 6px; }
        .checkline { display: flex; align-items: center; gap: 10px; padding: 8px 0; font-size: 14px; cursor: pointer; }
        .checkline input { width: auto; accent-color: var(--primary-color); }
        input[type=range] { width: 100%; accent-color: var(--primary-color); padding: 0; background: none; border: none; }
        input[type=color] {
          width: 64px; height: 38px; padding: 2px; border: 1px solid var(--fss-border);
          border-radius: 8px; background: var(--secondary-background-color, rgba(127,127,127,.08)); cursor: pointer;
        }
        .colorline { display: flex; align-items: center; gap: 14px; }
        .save-btn {
          position: sticky; bottom: 16px; width: 100%;
          padding: 16px; font-size: 15px; font-weight: 700; letter-spacing: 1px;
          border: none; border-radius: 12px; cursor: pointer; color: #fff;
          background: var(--fss-green); box-shadow: 0 4px 14px rgba(0,0,0,.25);
        }
        .save-btn:hover { filter: brightness(1.1); }

        /* schedule */
        .sch-row {
          display: grid; grid-template-columns: 34px 96px 1fr 1fr; gap: 10px;
          align-items: center; padding: 8px 0; border-bottom: 1px solid var(--fss-border);
        }
        .sch-row:last-child { border-bottom: none; }
        .sch-row .day { font-size: 14px; font-weight: 600; }
        .sch-row input[type=checkbox] { width: auto; accent-color: var(--primary-color); justify-self: start; }
        .sch-row.off .day, .sch-row.off input[type=time] { opacity: .4; }
        .sch-head { display: grid; grid-template-columns: 34px 96px 1fr 1fr; gap: 10px; padding: 4px 0 8px; font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--secondary-text-color); }
        @media (max-width: 480px) {
          .sch-row, .sch-head { grid-template-columns: 28px 44px 1fr 1fr; }
          .sch-row .day { font-size: 12px; }
        }

        /* health */
        .health-summary { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
        .chip {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 14px; border-radius: 99px; font-size: 13px; font-weight: 600;
          background: color-mix(in srgb, var(--secondary-text-color) 10%, transparent);
        }
        .chip ha-icon { --mdc-icon-size: 16px; }
        .chip.good { color: var(--fss-green); background: color-mix(in srgb, var(--fss-green) 12%, transparent); }
        .chip.bad { color: var(--fss-red); background: color-mix(in srgb, var(--fss-red) 12%, transparent); }
        .chip.warn { color: var(--fss-amber); background: color-mix(in srgb, var(--fss-amber) 14%, transparent); }
        .h-meta { display: flex; gap: 8px; align-items: center; flex: none; }
        .lqi { font-size: 11px; color: var(--secondary-text-color); width: 64px; text-align: right; }

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
          <button data-tab="dashboard" class="active"><ha-icon icon="mdi:view-dashboard-outline"></ha-icon>Dashboard</button>
          <button data-tab="devices"><ha-icon icon="mdi:devices"></ha-icon>Devices</button>
          <button data-tab="schedule"><ha-icon icon="mdi:calendar-clock"></ha-icon>Schedule</button>
          <button data-tab="health"><ha-icon icon="mdi:heart-pulse"></ha-icon>Health</button>
          <button data-tab="settings"><ha-icon icon="mdi:cog-outline"></ha-icon>Settings</button>
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
            <div id="ready-box" hidden></div>
            <div id="countdown" hidden>
              <div id="countdown-text"></div>
              <div class="bar"><div id="bar-fill"></div></div>
            </div>
            <button id="main-btn">ARM SYSTEM</button>
          </section>
          <section class="card">
            <h2><ha-icon icon="mdi:motion-sensor"></ha-icon> Security sensors</h2>
            <div id="sensor-grid"></div>
          </section>
          <section class="card">
            <h2><ha-icon icon="mdi:devices"></ha-icon> System devices</h2>
            <div id="device-strip"></div>
          </section>
          <section class="card">
            <h2><ha-icon icon="mdi:history"></ha-icon> Recent activity</h2>
            <div id="history-list"></div>
          </section>
        </div>

        <div class="view" id="view-devices">
          <section class="card discover-card">
            <ha-icon icon="mdi:radar"></ha-icon>
            <div class="discover-copy">
              <h2>Discover security devices</h2>
              <p class="hint">Scans door, motion, vibration, water, siren and remote entities. Review and choose what to add; Home Assistant Areas become zones.</p>
            </div>
            <button id="discover-btn" class="add-btn">SCAN</button>
          </section>
          <section class="card" id="discovery-results" hidden>
            <div class="discovery-head">
              <ha-icon icon="mdi:playlist-check"></ha-icon>
              <h2>Discovered devices</h2>
              <span class="pill idle static" id="discovery-count">0 found</span>
            </div>
            <p class="hint">Nothing is added until you select devices and confirm below.</p>
            <div id="discovery-list"></div>
            <div class="discovery-actions">
              <button id="add-discovered-btn" class="add-btn" disabled>ADD SELECTED</button>
              <button id="clear-discovery-btn" class="add-btn">CLEAR</button>
            </div>
          </section>
          <p class="hint" style="padding: 0 4px;">Tap a category to see its devices or add new ones.</p>
          ${Object.entries(LISTS).map(([key, meta]) => `
            <details class="card acc" data-acc="${key}">
              <summary>
                <ha-icon icon="${meta.icon}"></ha-icon>
                <span class="acc-title">${meta.title}</span>
                <span class="acc-sub" data-devsum="${key}"></span>
                <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>
              </summary>
              <div class="acc-body">
                ${key === "lights" ? `<p class="hint">These bulbs show the status color (red armed / green disarmed) and react when the alarm triggers — colors and actions are in Settings.</p>` : ""}
                <div data-devlist="${key}"></div>
                <div class="addrow">
                  <select data-addsel="${key}"><option value="">Select an entity…</option></select>
                  <button data-addbtn="${key}">ADD</button>
                </div>
                ${key === "buttons" ? `
                <div class="mqtt-block">
                  <div class="mqtt-title"><ha-icon icon="mdi:zigbee"></ha-icon> zigbee2mqtt button (recommended)</div>
                  <p class="hint">Many zigbee buttons (e.g. TS004F) never create an entity — they only send presses over MQTT. Add yours by its exact zigbee2mqtt device name.</p>
                  <div data-mqttlist></div>
                  <div class="addrow">
                    <input type="text" id="mqtt-btn-input" placeholder="z2m name, e.g. SecuritySwitch">
                    <button id="mqtt-btn-add">ADD</button>
                  </div>
                </div>
                <details class="adv">
                  <summary>Advanced: add by entity id</summary>
                  <div class="addrow" style="margin-top:10px;">
                    <input type="text" data-manual="${key}" placeholder="e.g. sensor.remote_action">
                    <button data-manualbtn="${key}">ADD ID</button>
                  </div>
                </details>` : ""}
              </div>
            </details>`).join("")}
        </div>

        <div class="view" id="view-schedule">
          <section class="card">
            <h2><ha-icon icon="mdi:calendar-clock"></ha-icon> Auto-arm schedule</h2>
            <p class="hint">
              The system arms and disarms itself at these times on enabled days.
              If the disarm time is earlier than the arm time, it disarms the
              next morning (e.g. arm 22:30 &rarr; disarm 06:30).
            </p>
            <label class="checkline" style="margin-bottom:10px;">
              <input type="checkbox" id="sch-enabled"> Enable automatic arming schedule
            </label>
            <div class="sch-head"><span></span><span>Day</span><span>Arm at</span><span>Disarm at</span></div>
            ${DAYS.map(([key, label]) => `
              <div class="sch-row" data-day="${key}">
                <input type="checkbox" class="sch-en" data-day="${key}">
                <span class="day">${label}</span>
                <input type="time" class="sch-arm" data-day="${key}" value="22:00">
                <input type="time" class="sch-disarm" data-day="${key}" value="07:00">
              </div>`).join("")}
          </section>
          <button id="save-schedule-btn" class="save-btn">SAVE SCHEDULE</button>
        </div>

        <div class="view" id="view-health">
          <section class="card">
            <h2><ha-icon icon="mdi:heart-pulse"></ha-icon> Device health</h2>
            <p class="hint">Battery and signal come from zigbee2mqtt. Replace batteries below 20%.</p>
            <div class="health-summary" id="health-summary"></div>
          </section>
          <section class="card">
            <div id="health-list"></div>
          </section>
        </div>

        <div class="view" id="view-settings">
          <p class="hint" style="padding: 0 4px;">Tap a section to edit, then hit Save at the bottom.</p>
          <details class="card acc">
            <summary>
              <ha-icon icon="mdi:timer-outline"></ha-icon>
              <span class="acc-title">Timing</span>
              <span class="acc-sub" id="sum-timing"></span>
              <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>
            </summary>
            <div class="acc-body">
              <p class="hint">Exit delay gives you time to leave. Entry delay gives you time to disarm before the sirens fire.</p>
              <div class="grid2">
                <div class="field"><label>Exit delay (seconds)</label><input type="number" min="0" id="f-arming_delay"></div>
                <div class="field"><label>Entry delay (seconds)</label><input type="number" min="0" id="f-entry_delay"></div>
              </div>
            </div>
          </details>

          <details class="card acc">
            <summary>
              <ha-icon icon="mdi:bullhorn"></ha-icon>
              <span class="acc-title">Siren sounds &amp; modes</span>
              <span class="acc-sub" id="sum-siren"></span>
              <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>
            </summary>
            <div class="acc-body">
              <div class="field"><label>Duration (seconds, 0 = until disarmed)</label><input type="number" min="0" id="f-siren_duration"></div>
              <div class="field" style="margin-top:14px;">
                <label>Volume: <span id="volume-label">100%</span></label>
                <input type="range" min="0" max="100" step="5" id="f-siren_volume">
              </div>
              <div id="siren-controls" style="margin-top:14px;"></div>
            </div>
          </details>

          <details class="card acc">
            <summary>
              <ha-icon icon="mdi:lightbulb-group"></ha-icon>
              <span class="acc-title">Lights</span>
              <span class="acc-sub" id="sum-lights"></span>
              <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>
            </summary>
            <div class="acc-body">
            <p class="hint">The lights you added in Devices do double duty: they show the system state by color (red armed, green disarmed) and react when the alarm is triggered.</p>
            <div class="grid2">
              <div class="field">
                <label>Armed color</label>
                <div class="colorline">
                  <input type="color" id="f-armed_light_color" value="#ff0000">
                  <span class="hint" style="margin:0;">Shown while arming and armed.</span>
                </div>
              </div>
              <div class="field">
                <label>Disarmed color</label>
                <div class="colorline">
                  <input type="color" id="f-disarmed_light_color" value="#00c800">
                  <span class="hint" style="margin:0;">Shown when disarmed (if enabled below).</span>
                </div>
              </div>
            </div>
            <label class="checkline" style="margin-top:8px;">
              <input type="checkbox" id="f-disarmed_lights_on">
              Show the disarmed color when disarmed (otherwise the lights turn off)
            </label>
            <label class="checkline">
              <input type="checkbox" id="f-arming_flash">
              Flash quickly during the exit delay, then go solid once armed
            </label>
            <div class="grid2" style="margin-top:14px; padding-top:14px; border-top:1px solid var(--fss-border);">
              <div class="field"><label>Action when the alarm triggers</label>
                <select id="f-light_mode">
                  <option value="flash_long">Flash (long)</option>
                  <option value="flash_short">Flash (short)</option>
                  <option value="solid_red">Solid red</option>
                  <option value="solid_white">Solid white</option>
                </select>
              </div>
              <div class="field"><label>Trigger action duration (seconds, 0 = until disarmed)</label><input type="number" min="0" id="f-light_duration"></div>
            </div>
            </div>
          </details>

          <details class="card acc">
            <summary>
              <ha-icon icon="mdi:water-alert"></ha-icon>
              <span class="acc-title">Flood protection</span>
              <span class="acc-sub" id="sum-flood"></span>
              <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>
            </summary>
            <div class="acc-body">
              <p class="hint">Flood sensors are monitored 24/7, even when the system is disarmed. Alerts always go to your phones.</p>
              <label class="checkline"><input type="checkbox" id="f-flood_siren"> Sound the sirens on a water leak</label>
            </div>
          </details>

          <details class="card acc">
            <summary>
              <ha-icon icon="mdi:gesture-double-tap"></ha-icon>
              <span class="acc-title">Button actions</span>
              <span class="acc-sub" id="sum-buttons"></span>
              <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>
            </summary>
            <div class="acc-body">
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
            </div>
          </details>

          <details class="card acc">
            <summary>
              <ha-icon icon="mdi:cellphone-message"></ha-icon>
              <span class="acc-title">Phone notifications</span>
              <span class="acc-sub" id="sum-notify"></span>
              <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>
            </summary>
            <div class="acc-body">
            <p class="hint">Sent when the alarm triggers, a leak is detected, or arming fails.</p>
            <div id="notify-list"></div>
            <label class="checkline" style="border-top:1px solid var(--fss-border); margin-top:8px; padding-top:14px;">
              <input type="checkbox" id="f-notify_arm_disarm"> Also notify on every arm / disarm
            </label>
            <label class="checkline">
              <input type="checkbox" id="f-critical_alerts">
              Critical alerts — alarm, leak and sensor-offline alerts break through Do&nbsp;Not&nbsp;Disturb / silent mode
            </label>
            <p class="hint" style="margin:6px 0 0;">
              Alarm and leak notifications include Disarm / Silence buttons you
              can tap right on the phone. A sensor dropping offline while the
              system is armed alerts you immediately.
            </p>
            </div>
          </details>

          <details class="card acc">
            <summary>
              <ha-icon icon="mdi:heart-pulse"></ha-icon>
              <span class="acc-title">Device health alerts</span>
              <span class="acc-sub" id="sum-health"></span>
              <ha-icon class="chev" icon="mdi:chevron-down"></ha-icon>
            </summary>
            <div class="acc-body">
            <p class="hint">Automatically checks every device for low battery or offline status at the times below and notifies the phones ticked above so you can fix issues in time.</p>
            <label class="checkline" style="margin-bottom:6px;">
              <input type="checkbox" id="f-health_check_enabled"> Enable automatic health checks
            </label>
            <div class="grid2">
              <div class="field"><label>Check time 1</label><input type="time" id="f-health_time1" value="09:00"></div>
              <div class="field"><label>Check time 2 (optional)</label><input type="time" id="f-health_time2"></div>
            </div>
            <div class="field" style="margin-top:14px;">
              <label>Schedule Days</label>
              <div class="days-grid" id="f-health_days" style="display:flex; gap:10px; margin-top:6px; flex-wrap:wrap;">
                <label><input type="checkbox" value="mon"> Mon</label>
                <label><input type="checkbox" value="tue"> Tue</label>
                <label><input type="checkbox" value="wed"> Wed</label>
                <label><input type="checkbox" value="thu"> Thu</label>
                <label><input type="checkbox" value="fri"> Fri</label>
                <label><input type="checkbox" value="sat"> Sat</label>
                <label><input type="checkbox" value="sun"> Sun</label>
              </div>
            </div>
            <div class="field" style="margin-top:14px;">
              <label>Low battery warning below (%)</label>
              <input type="number" min="1" max="100" id="f-health_battery_threshold" value="20">
            </div>
            <button id="health-test-btn" class="add-btn" style="margin-top:14px;">Send a test health report now</button>
            </div>
          </details>

          <button id="save-btn" class="save-btn">SAVE SETTINGS</button>
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

      // Dashboard: expand/collapse activity, jump to Devices from the strip.
      this.$("#history-list").addEventListener("click", (e) => {
        if (e.target.closest("#hist-more")) {
          this._histAll = !this._histAll;
          this._renderHistory();
        }
      });
      this.$("#device-strip").addEventListener("click", (e) => {
        if (e.target.closest("[data-goto]")) this._switchTab("devices");
      });
      this.$("#discover-btn").addEventListener("click", () => this._discoverDevices());
      this.$("#add-discovered-btn").addEventListener("click", () => this._addDiscoveredDevices());
      this.$("#clear-discovery-btn").addEventListener("click", () => {
        this._discoveredDevices = [];
        this._renderDiscoveryResults();
      });
      this.$("#discovery-list").addEventListener("change", () => {
        const selected = this.$$('[data-discovered-device]:checked').length;
        this.$("#add-discovered-btn").disabled = selected === 0;
      });

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
        const rename = e.target.closest("[data-rename]");
        if (rename) {
          const entityId = rename.dataset.rename;
          const existing = (this._attrs().device_names || {})[entityId] || "";
          const nextName = window.prompt(
            `Security display name for ${this._name(entityId)}\n(leave empty to use the Home Assistant name)`,
            existing,
          );
          if (nextName === null) return;
          this._hass.callService("fullstacksecurity", "update_config", {
            action: "rename", entity_id: entityId, name: nextName,
          }).then(() => {
            this._toast(nextName.trim() ? "Security name saved" : "Using Home Assistant name");
          }).catch((err) => this._toast(`Rename failed: ${err.message || err}`, false));
          return;
        }
        const add = e.target.closest("[data-addbtn]");
        if (add) {
          const key = add.dataset.addbtn;
          const sel = this.$(`[data-addsel="${key}"]`);
          if (!sel.value) return this._toast("Pick an entity first", false);
          const entityId = sel.value;
          add.disabled = true;
          this._hass.callService("fullstacksecurity", "update_config", {
            action: "add", type: key, entity_id: sel.value, zone: this._zoneFor(entityId),
          }).then(() => {
            this._toast(`Added ${this._name(entityId)}`);
            sel.value = "";
            this._refreshAddSelects(true);
          }).catch((err) => {
            this._toast(`Add failed: ${err.message || err}`, false);
          }).finally(() => {
            add.disabled = false;
          });
        }
        const manual = e.target.closest("[data-manualbtn]");
        if (manual) {
          const key = manual.dataset.manualbtn;
          const input = this.$(`[data-manual="${key}"]`);
          const entityId = (input.value || "").trim();
          if (!/^[a-z0-9_]+\.[a-z0-9_]+$/.test(entityId)) {
            return this._toast("Enter a valid entity id", false);
          }
          manual.disabled = true;
          this._hass.callService("fullstacksecurity", "update_config", {
            action: "add", type: key, entity_id: entityId, zone: this._zoneFor(entityId),
          }).then(() => {
            this._toast(`Added ${this._name(entityId)}`);
            input.value = "";
            this._refreshAddSelects(true);
          }).catch((err) => {
            this._toast(`Add failed: ${err.message || err}`, false);
          }).finally(() => {
            manual.disabled = false;
          });
        }
        const rmMqtt = e.target.closest("[data-removemqtt]");
        if (rmMqtt) {
          const name = rmMqtt.dataset.removemqtt;
          if (confirm(`Remove z2m button "${name}"?`)) {
            this._hass.callService("fullstacksecurity", "update_config", {
              action: "remove", type: "mqtt_buttons", entity_id: name,
            });
            this._toast(`Removed ${name}`);
          }
          return;
        }
        const addMqtt = e.target.closest("#mqtt-btn-add");
        if (addMqtt) {
          const input = this.$("#mqtt-btn-input");
          const name = (input.value || "").trim();
          if (!name) return this._toast("Enter the zigbee2mqtt name", false);
          if ((this._attrs().mqtt_buttons || []).includes(name)) {
            return this._toast(`${name} is already added`, false);
          }
          addMqtt.disabled = true;
          this._hass.callService("fullstacksecurity", "update_config", {
            action: "add", type: "mqtt_buttons", entity_id: name,
          }).then(() => {
            this._toast(`Added ${name} — press it to test`);
            input.value = "";
          }).catch((err) => {
            this._toast(`Add failed: ${err.message || err}`, false);
          }).finally(() => {
            addMqtt.disabled = false;
          });
        }
      });

      const markDirty = () => { this._dirty = true; };
      this.$("#view-settings").addEventListener("change", (e) => {
        markDirty();
        const nativeSelect = e.target.closest("[data-native-siren-select]");
        if (!nativeSelect) return;
        const oldValue = nativeSelect.dataset.current;
        nativeSelect.disabled = true;
        this._hass.callService("select", "select_option", {
          entity_id: nativeSelect.dataset.nativeSirenSelect,
          option: nativeSelect.value,
        }).then(() => {
          this._toast("Siren mode updated");
        }).catch((err) => {
          nativeSelect.value = oldValue;
          this._toast(`Siren mode failed: ${err.message || err}`, false);
        }).finally(() => {
          nativeSelect.disabled = false;
        });
      });
      this.$("#view-settings").addEventListener("input", markDirty);
      this.$("#save-btn").addEventListener("click", () => this._saveSettings());

      this.$("#health-test-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        this._hass.callService("fullstacksecurity", "update_config", {
          action: "health_check",
        });
        this._toast("Test health report sent to your phone(s)");
      });

      this.$("#f-siren_volume").addEventListener("input", (e) => {
        this.$("#volume-label").textContent = `${e.target.value}%`;
      });

      const markSchDirty = () => { this._schDirty = true; this._updateScheduleRowStyles(); };
      this.$("#view-schedule").addEventListener("change", markSchDirty);
      this.$("#view-schedule").addEventListener("input", markSchDirty);
      this.$("#save-schedule-btn").addEventListener("click", () => this._saveSchedule());
    }

    _switchTab(tab) {
      this._tab = tab;
      this.$$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
      this.$$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${tab}`));
      if (tab === "devices") this._refreshAddSelects(true);
      if (tab === "settings" && !this._dirty) this._populateSettings();
      if (tab === "schedule" && !this._schDirty) this._populateSchedule();
      if (tab === "health") this._renderHealth();
    }

    async _discoverDevices() {
      const button = this.$("#discover-btn");
      button.disabled = true;
      try {
        await this._loadAreaZones();
        const existing = new Set(
          Object.keys(LISTS).flatMap((key) => this._configured(key))
        );
        const found = [];

        for (const [entityId, state] of Object.entries(this._hass.states)) {
          let listKey = ["doors", "vibration", "flood", "sirens", "buttons"]
            .find((key) => isCandidateForList(key, entityId, state, true));
          // A switch can be a siren, but automatically adding every switch
          // would pull in unrelated plugs and relays. Those remain manual.
          if (listKey === "sirens" && entityId.startsWith("switch.")) listKey = undefined;
          if (!listKey || existing.has(entityId)) continue;
          found.push({ entityId, listKey, zone: this._zoneFor(entityId) });
        }

        this._discoveredDevices = found.sort((a, b) =>
          a.zone.localeCompare(b.zone) || this._name(a.entityId).localeCompare(this._name(b.entityId))
        );
        this._renderDiscoveryResults();
        if (!found.length) {
          this._toast("All discovered security devices are already added");
          return;
        }
        this._toast(`Found ${found.length} device${found.length === 1 ? "" : "s"} - select what to add`);
      } catch (err) {
        this._toast(`Discovery failed: ${err.message || err}`, false);
      } finally {
        button.disabled = false;
      }
    }

    _renderDiscoveryResults() {
      const section = this.$("#discovery-results");
      const list = this.$("#discovery-list");
      const devices = this._discoveredDevices || [];
      section.hidden = devices.length === 0;
      this.$("#discovery-count").textContent = `${devices.length} found`;
      this.$("#add-discovered-btn").disabled = true;
      list.innerHTML = devices.map((device) => `
        <label class="discovery-row">
          <input type="checkbox" data-discovered-device="${device.entityId}">
          <ha-icon icon="${LISTS[device.listKey].icon}"></ha-icon>
          <span class="nm">${escapeHtml(this._name(device.entityId))}<span class="eid">${escapeHtml(device.zone)} · ${escapeHtml(device.entityId)}</span></span>
          <span class="kind">${escapeHtml(LISTS[device.listKey].title)}</span>
        </label>`).join("");
    }

    async _addDiscoveredDevices() {
      const selectedIds = new Set(
        this.$$('[data-discovered-device]:checked').map((input) => input.dataset.discoveredDevice)
      );
      const selected = this._discoveredDevices.filter((device) => selectedIds.has(device.entityId));
      if (!selected.length) {
        this._toast("Select at least one device", false);
        return;
      }
      const button = this.$("#add-discovered-btn");
      button.disabled = true;
      const devices = { doors: [], vibration: [], flood: [], sirens: [], buttons: [] };
      const zones = {};
      for (const device of selected) {
        devices[device.listKey].push(device.entityId);
        zones[device.entityId] = device.zone;
      }
      try {
        await this._hass.callService("fullstacksecurity", "update_config", {
          action: "discover", devices, zones,
        });
        this._discoveredDevices = this._discoveredDevices.filter(
          (device) => !selectedIds.has(device.entityId)
        );
        this._renderDiscoveryResults();
        this._toast(`Added ${selected.length} security device${selected.length === 1 ? "" : "s"}`);
      } catch (err) {
        button.disabled = false;
        this._toast(`Add failed: ${err.message || err}`, false);
      }
    }

    /* ------------------------------------------------------------- actions */

    _mainAction() {
      const alarm = this._alarm();
      if (!alarm) return;
      if (alarm.state === "disarmed") {
        const open = (alarm.attributes.open_sensors || []);
        const dead = (alarm.attributes.unavailable_sensors || []);
        if (open.length || dead.length) {
          const parts = [];
          if (open.length) parts.push(`open: ${open.map((e) => this._name(e)).join(", ")}`);
          if (dead.length) parts.push(`offline: ${dead.map((e) => this._name(e)).join(", ")}`);
          this._toast(`Cannot arm — ${parts.join(" / ")}`, false);
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
      data.siren_volume = parseInt(this.$("#f-siren_volume").value, 10);
      data.siren_tones = { ...(this._attrs().siren_tones || {}) };
      this.$$('[data-siren-tone]').forEach((select) => {
        if (select.value) data.siren_tones[select.dataset.sirenTone] = select.value;
        else delete data.siren_tones[select.dataset.sirenTone];
      });
      data.armed_light_color = this.$("#f-armed_light_color").value;
      data.disarmed_light_color = this.$("#f-disarmed_light_color").value;
      data.disarmed_lights_on = this.$("#f-disarmed_lights_on").checked;
      data.arming_flash = this.$("#f-arming_flash").checked;
      data.flood_siren = this.$("#f-flood_siren").checked;
      data.notify_arm_disarm = this.$("#f-notify_arm_disarm").checked;
      data.critical_alerts = this.$("#f-critical_alerts").checked;
      data.notify_services = this.$$("#notify-list input:checked").map((c) => c.value);
      data.health_check_enabled = this.$("#f-health_check_enabled").checked;
      data.health_check_days = this.$$("#f-health_days input:checked").map((c) => c.value);
      data.health_check_times = [
        this.$("#f-health_time1").value,
        this.$("#f-health_time2").value,
      ].filter(Boolean);
      data.health_battery_threshold = Math.min(100, Math.max(1,
        parseInt(this.$("#f-health_battery_threshold").value, 10) || 20));

      this._hass
        .callService("fullstacksecurity", "update_config", data)
        .then(() => {
          this._dirty = false;
          this._toast("Settings saved ✓");
        })
        .catch((err) => this._toast(`Save failed: ${err.message || err}`, false));
    }

    _saveSchedule() {
      const schedules = {};
      for (const [key] of DAYS) {
        schedules[key] = {
          enabled: this.$(`.sch-en[data-day="${key}"]`).checked,
          arm: this.$(`.sch-arm[data-day="${key}"]`).value || "22:00",
          disarm: this.$(`.sch-disarm[data-day="${key}"]`).value || "07:00",
        };
      }
      this._hass
        .callService("fullstacksecurity", "update_config", {
          action: "settings",
          schedules_enabled: this.$("#sch-enabled").checked,
          schedules,
        })
        .then(() => {
          this._schDirty = false;
          this._toast("Schedule saved ✓");
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
      this._renderDeviceStrip();
      this._renderHistory();

      const sig = JSON.stringify(CONFIG_ATTRS.map((k) => this._attrs()[k]));
      const cfgChanged = sig !== this._configSig;
      this._configSig = sig;

      this._renderDeviceLists();
      if (this._tab === "health") this._renderHealth();
      if (cfgChanged) {
        this._refreshAddSelects(false);
        if (!this._dirty) this._populateSettings();
        if (!this._schDirty) this._populateSchedule();
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
      const dead = a.unavailable_sensors || [];
      const nodata = a.nodata_sensors || [];
      const blocked = open.length > 0 || dead.length > 0;

      // Pre-arm readiness: always visible while disarmed. Open/offline
      // sensors block arming; no-data sensors are surfaced but don't block.
      const readyBox = this.$("#ready-box");
      readyBox.hidden = alarm.state !== "disarmed";
      if (!readyBox.hidden) {
        if (!blocked && nodata.length === 0) {
          readyBox.innerHTML = `
            <span class="ready-chip good"><ha-icon icon="mdi:check-circle"></ha-icon>All ${secCount} sensor${secCount === 1 ? "" : "s"} ready</span>`;
        } else {
          readyBox.innerHTML =
            open.map((e) => `
              <span class="ready-chip"><ha-icon icon="mdi:door-open"></ha-icon>${this._name(e)} — OPEN</span>`).join("") +
            dead.map((e) => `
              <span class="ready-chip"><ha-icon icon="mdi:lan-disconnect"></ha-icon>${this._name(e)} — OFFLINE</span>`).join("") +
            nodata.map((e) => `
              <span class="ready-chip warn"><ha-icon icon="mdi:help-circle-outline"></ha-icon>${this._name(e)} — NO DATA</span>`).join("");
        }
      }
      this.$("#main-btn").disabled = alarm.state === "disarmed" && blocked;

      let sub = "";
      if (alarm.state === "disarmed") {
        sub = blocked
          ? "Not ready to arm — fix the sensors below first"
          : `Ready to arm — ${secCount} sensor${secCount === 1 ? "" : "s"} configured`;
        if (a.schedules_enabled) sub += " · schedule on";
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
      const flood = this._hass.states["binary_sensor.fullstack_security_flood_alert"] ||
        Object.values(this._hass.states).find(
          (s) => s.entity_id.startsWith("binary_sensor.") &&
            s.attributes.friendly_name === "FullStack Security Flood Alert"
        );
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
      const zone = this._zoneFor(entityId);
      const subtitle = zone === "Unassigned" ? entityId : `${zone} · ${entityId}`;
      return `
        <div class="row">
          <ha-icon icon="${LISTS[listKey].icon}"></ha-icon>
          <span class="nm">${escapeHtml(this._name(entityId))}<span class="eid">${escapeHtml(subtitle)}</span></span>
          <span class="pill ${st.cls}">${st.text}</span>
          ${removable ? `<button class="edit" title="Rename in Security" data-rename="${entityId}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button>` : ""}
          ${removable ? `<button class="rm" title="Remove" data-remove="${entityId}" data-list="${listKey}"><ha-icon icon="mdi:close"></ha-icon></button>` : ""}
        </div>`;
    }

    _renderSensorGrid() {
      // Dashboard shows the sensors that can trigger something; sirens,
      // lights and buttons live in the compact System devices strip below.
      const grid = this.$("#sensor-grid");
      const zones = new Map();
      for (const key of ["doors", "vibration", "flood"]) {
        for (const entityId of this._configured(key)) {
          const zone = this._zoneFor(entityId);
          if (!zones.has(zone)) zones.set(zone, []);
          zones.get(zone).push({ key, entityId });
        }
      }
      let html = "";
      [...zones.keys()]
        .sort((a, b) => (a === "Unassigned") - (b === "Unassigned") || a.localeCompare(b))
        .forEach((zone) => {
          html += `<div class="group-label">${escapeHtml(zone)}</div>`;
          for (const key of ["doors", "vibration", "flood"]) {
            const items = zones.get(zone).filter((item) => item.key === key);
            if (!items.length) continue;
            html += `<div class="group-label" style="padding-top:8px; opacity:.75;">${LISTS[key].title}</div>`;
            html += items.map((item) => this._rowHtml(item.key, item.entityId, false)).join("");
          }
        });
      grid.innerHTML = html ||
        `<div class="empty">No sensors yet — add door, vibration and flood sensors in the Devices tab.</div>`;
    }

    _renderDeviceStrip() {
      // One compact row per output category; tap to jump to Devices.
      const strip = this.$("#device-strip");
      let html = "";
      for (const key of ["sirens", "lights", "buttons"]) {
        const items = this._configured(key);
        const mqtt = key === "buttons" ? (this._attrs().mqtt_buttons || []) : [];
        const total = items.length + mqtt.length;
        if (!total) continue;
        const offline = items.filter((e) => {
          const s = this._hass.states[e];
          return !s || s.state === "unavailable";
        }).length;
        const active = items.filter((e) => {
          const s = this._hass.states[e];
          return s && s.state === "on";
        }).length;
        let pill;
        if (offline) pill = `<span class="pill warn static">${offline} OFFLINE</span>`;
        else if (key === "sirens" && active) pill = `<span class="pill alert">SOUNDING</span>`;
        else pill = `<span class="pill safe static">OK</span>`;
        html += `
          <div class="strip-row" data-goto="devices">
            <ha-icon icon="${LISTS[key].icon}"></ha-icon>
            <span class="nm">${LISTS[key].title}<span class="eid">${total} device${total === 1 ? "" : "s"}</span></span>
            ${pill}
          </div>`;
      }
      strip.innerHTML = html ||
        `<div class="empty">No sirens, lights or buttons yet — add them in the Devices tab.</div>`;
    }

    _renderHistory() {
      const all = (this._attrs().history || []).slice().reverse();
      const hist = this._histAll ? all : all.slice(0, 6);
      const fmt = (t) => {
        const d = new Date(t);
        return isNaN(d) ? "" : d.toLocaleString([], {
          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        });
      };
      let html = hist.length
        ? hist.map((h) => `
            <div class="hist-row">
              <ha-icon icon="${HISTORY_ICONS[h.i] || "mdi:information-outline"}"></ha-icon>
              <span class="when">${fmt(h.t)}</span>
              <span class="what">${h.m}</span>
            </div>`).join("")
        : `<div class="empty">No activity yet.</div>`;
      if (all.length > 6) {
        html += `<button class="linkbtn" id="hist-more">${this._histAll ? "Show less" : `Show all (${all.length})`}</button>`;
      }
      this.$("#history-list").innerHTML = html;
    }

    _renderDeviceLists() {
      for (const key of Object.keys(LISTS)) {
        const el = this.$(`[data-devlist="${key}"]`);
        const items = this._configured(key);
        el.innerHTML = items.length
          ? items.map((e) => this._rowHtml(key, e, true)).join("")
          : `<div class="empty">Nothing added yet.</div>`;

        // Summary in the collapsed header: count + any problems.
        const sum = this.$(`[data-devsum="${key}"]`);
        if (sum) {
          const mqtt = key === "buttons" ? (this._attrs().mqtt_buttons || []).length : 0;
          const total = items.length + mqtt;
          const offline = items.filter((e) => {
            const s = this._hass.states[e];
            return !s || s.state === "unavailable";
          }).length;
          const open = ["doors", "vibration", "flood"].includes(key)
            ? items.filter((e) => {
                const s = this._hass.states[e];
                return s && s.state === "on";
              }).length
            : 0;
          let extra = "";
          if (offline) extra = ` · <span class="alerttext">${offline} offline</span>`;
          else if (open) extra = ` · <span class="warntext">${open} open</span>`;
          sum.innerHTML = total ? `${total} added${extra}` : "none yet";
        }
      }
      this._renderMqttButtons();
    }

    _renderMqttButtons() {
      const el = this.$("[data-mqttlist]");
      if (!el) return;
      const items = this._attrs().mqtt_buttons || [];
      el.innerHTML = items.length
        ? items.map((name) => `
          <div class="row">
            <ha-icon icon="mdi:zigbee"></ha-icon>
            <span class="nm">${name}<span class="eid">zigbee2mqtt/${name}</span></span>
            <span class="pill idle">MQTT</span>
            <button class="rm" title="Remove" data-removemqtt="${name}"><ha-icon icon="mdi:close"></ha-icon></button>
          </div>`).join("")
        : `<div class="empty">No zigbee2mqtt buttons added yet.</div>`;
    }

    _refreshAddSelects(force) {
      for (const key of Object.keys(LISTS)) {
        const sel = this.$(`[data-addsel="${key}"]`);
        if (!force && this.shadowRoot.activeElement === sel) continue;
        const prev = sel.value;
        const opts = this._candidates(key)
          .map((e) => `<option value="${e}">${this._name(e)} (${e})</option>`)
          .join("");
        sel.innerHTML = `<option value="">Select an entity…</option>` + opts;
        if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
      }
    }

    /* ------------------------------------------------------------- health */

    _renderHealth() {
      const rows = [];
      for (const [key, meta] of Object.entries(LISTS)) {
        for (const id of this._configured(key)) {
          const s = this._hass.states[id];
          const unavailable = !s || s.state === "unavailable" || s.state === "unknown";
          rows.push({
            id, key, meta,
            unavailable,
            battery: this._batteryFor(id),
            lqi: this._lqiFor(id),
          });
        }
      }
      // Problems first: unavailable, then low battery, then the rest.
      rows.sort((a, b) => {
        const rank = (r) => (r.unavailable ? 0 : (r.battery !== null && r.battery < 20 ? 1 : 2));
        return rank(a) - rank(b) || this._name(a.id).localeCompare(this._name(b.id));
      });

      const unavailCount = rows.filter((r) => r.unavailable).length;
      const lowBatt = rows.filter((r) => !r.unavailable && r.battery !== null && r.battery < 20).length;
      const okCount = rows.length - unavailCount - lowBatt;

      this.$("#health-summary").innerHTML = `
        <span class="chip good"><ha-icon icon="mdi:check-circle"></ha-icon>${okCount} healthy</span>
        <span class="chip ${lowBatt ? "warn" : ""}"><ha-icon icon="mdi:battery-alert"></ha-icon>${lowBatt} low battery</span>
        <span class="chip ${unavailCount ? "bad" : ""}"><ha-icon icon="mdi:lan-disconnect"></ha-icon>${unavailCount} unavailable</span>`;

      const battPill = (r) => {
        if (r.battery === null) return `<span class="pill idle static">MAINS / N/A</span>`;
        const v = Math.round(r.battery);
        const cls = v < 20 ? "alert" : (v < 50 ? "warn" : "safe");
        return `<span class="pill ${cls} static">🔋 ${v}%</span>`;
      };

      this.$("#health-list").innerHTML = rows.length
        ? rows.map((r) => `
            <div class="row">
              <ha-icon icon="${r.meta.icon}"></ha-icon>
              <span class="nm">${this._name(r.id)}<span class="eid">${r.id}</span></span>
              <span class="h-meta">
                <span class="lqi">${r.lqi !== null ? `LQI ${Math.round(r.lqi)}` : ""}</span>
                ${battPill(r)}
                <span class="pill ${r.unavailable ? "alert" : "safe"} static">${r.unavailable ? "OFFLINE" : "ONLINE"}</span>
              </span>
            </div>`).join("")
        : `<div class="empty">No devices configured yet.</div>`;
    }

    /* ----------------------------------------------------------- schedule */

    _populateSchedule() {
      const a = this._attrs();
      this.$("#sch-enabled").checked = a.schedules_enabled === true;
      const sch = a.schedules || {};
      for (const [key] of DAYS) {
        const row = sch[key] || {};
        this.$(`.sch-en[data-day="${key}"]`).checked = row.enabled === true;
        if (row.arm) this.$(`.sch-arm[data-day="${key}"]`).value = row.arm;
        if (row.disarm) this.$(`.sch-disarm[data-day="${key}"]`).value = row.disarm;
      }
      this._updateScheduleRowStyles();
    }

    _updateScheduleRowStyles() {
      for (const [key] of DAYS) {
        const en = this.$(`.sch-en[data-day="${key}"]`).checked;
        this.$(`.sch-row[data-day="${key}"]`).classList.toggle("off", !en);
      }
    }

    /* ----------------------------------------------------------- settings */

    _sirenSelectControl(entityId) {
      const state = this._hass.states[entityId];
      const options = state && state.attributes ? state.attributes.options : null;
      if (!state || !Array.isArray(options) || !options.length) return null;
      const normalized = options.map((option) => String(option));
      const current = String(state.state || "");
      if (current && !["unknown", "unavailable"].includes(current) && !normalized.includes(current)) {
        normalized.unshift(current);
      }
      return {
        entityId,
        name: state.attributes.friendly_name || entityId,
        state: current,
        options: normalized,
      };
    }

    _allSirenModeSelects() {
      return Object.keys(this._hass.states)
        .filter((entityId) => entityId.startsWith("select."))
        .map((entityId) => this._sirenSelectControl(entityId))
        .filter((control) => control && /alarm|sound|tone|melody|ring|chime|siren/.test(
          `${control.entityId} ${control.name}`.toLowerCase()
        ));
    }

    _nativeSirenSelects(sirenId) {
      const sirenState = this._hass.states[sirenId];
      if (!sirenState) return [];
      const related = new Set();
      const sirenRegistryEntry = this._entityRegistry.find(
        (entry) => entry.entity_id === sirenId
      );
      if (sirenRegistryEntry && sirenRegistryEntry.device_id) {
        this._entityRegistry
          .filter((entry) => entry.device_id === sirenRegistryEntry.device_id &&
            entry.entity_id.startsWith("select."))
          .forEach((entry) => related.add(entry.entity_id));
      }
      for (const control of this._allSirenModeSelects()) {
        if (sirenControlScore(sirenId, sirenState, control.entityId, this._hass.states[control.entityId]) > 0) {
          related.add(control.entityId);
        }
      }
      return [...related]
        .map((entityId) => this._sirenSelectControl(entityId))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    _nativeSirenControlHtml(control) {
      return `
        <div class="field">
          <label>${escapeHtml(control.name)}</label>
          <select data-native-siren-select="${control.entityId}" data-current="${escapeHtml(control.state)}">
            ${control.options.map((option) => `<option value="${escapeHtml(option)}" ${option === control.state ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
          </select>
        </div>`;
    }

    _renderSirenControls() {
      const container = this.$("#siren-controls");
      if (!container) return;
      const attrs = this._attrs();
      const sirens = attrs.sirens || [];
      const selectedTones = attrs.siren_tones || {};
      const fallbackTone = attrs.siren_tone || "";
      if (!sirens.length) {
        container.innerHTML = `<div class="empty">Add a siren in Devices to choose its sound modes.</div>`;
        return;
      }
      const linkedControlIds = new Set();
      const sirenCards = sirens.map((sirenId) => {
          const state = this._hass.states[sirenId];
          const tones = toneOptions(state && state.attributes && state.attributes.available_tones);
          const selected = selectedTones[sirenId] || "";
          const reportedTone = state && state.attributes ? state.attributes.tone : "";
          const knownTones = new Set(tones.map((tone) => tone.value));
          if (selected && !knownTones.has(selected)) {
            tones.unshift({ value: selected, label: `${selected} (saved)` });
          }
          const toneControl = tones.length ? `
            <div class="field">
              <label>Alarm sound (used when the alarm starts)</label>
              <select data-siren-tone="${sirenId}">
                <option value="">${escapeHtml(fallbackTone ? `Use saved fallback: ${fallbackTone}` : "Use this siren's default")}</option>
                ${tones.map((tone) => `<option value="${escapeHtml(tone.value)}" ${tone.value === selected ? "selected" : ""}>${escapeHtml(tone.label)}</option>`).join("")}
              </select>
            </div>` : `
            <div class="field"><label>Alarm sound</label><div class="siren-note">This entity does not publish a tone list.</div></div>`;
          const nativeControls = this._nativeSirenSelects(sirenId);
          nativeControls.forEach((control) => linkedControlIds.add(control.entityId));
          const reported = reportedTone ? `Current tone reported by the siren: ${reported}` :
            "Current tone is shown when this siren integration reports it.";
          return `
            <div class="siren-control">
              <div class="siren-name"><ha-icon icon="mdi:bullhorn"></ha-icon>${escapeHtml(this._name(sirenId))}</div>
              <div class="grid2">${toneControl}${nativeControls.map((control) => this._nativeSirenControlHtml(control)).join("")}</div>
              <p class="siren-note">${escapeHtml(reported)}</p>
            </div>`;
        });
      const unlinkedControls = this._allSirenModeSelects()
        .filter((control) => !linkedControlIds.has(control.entityId));
      const unmatchedCard = unlinkedControls.length ? `
        <div class="siren-control">
          <div class="siren-name"><ha-icon icon="mdi:tune-variant"></ha-icon>Other siren sound and mode controls</div>
          <div class="grid2">${unlinkedControls.map((control) => this._nativeSirenControlHtml(control)).join("")}</div>
          <p class="siren-note">Home Assistant exposes these sound controls but did not link them to a configured siren. They still update immediately.</p>
        </div>` : "";
      container.innerHTML = `
        <p class="hint">Each siren keeps its own alarm sound. Device mode selectors update the siren immediately; choose an alarm sound below, then save settings.</p>
        ${sirenCards.join("")}${unmatchedCard}`;
    }

    _populateSettings() {
      const a = this._attrs();
      const set = (id, v) => { const el = this.$(id); if (el) el.value = v; };
      set("#f-arming_delay", a.arming_delay !== undefined ? a.arming_delay : 30);
      set("#f-entry_delay", a.entry_delay !== undefined ? a.entry_delay : 30);
      set("#f-siren_duration", a.siren_duration !== undefined ? a.siren_duration : 0);
      set("#f-siren_volume", a.siren_volume !== undefined ? a.siren_volume : 100);
      this.$("#volume-label").textContent = `${a.siren_volume !== undefined ? a.siren_volume : 100}%`;
      set("#f-light_mode", a.light_mode || "flash_long");
      set("#f-light_duration", a.light_duration !== undefined ? a.light_duration : 0);
      set("#f-armed_light_color", /^#[0-9a-fA-F]{6}$/.test(a.armed_light_color || "") ? a.armed_light_color : "#ff0000");
      set("#f-disarmed_light_color", /^#[0-9a-fA-F]{6}$/.test(a.disarmed_light_color || "") ? a.disarmed_light_color : "#00c800");
      this.$("#f-disarmed_lights_on").checked = a.disarmed_lights_on === true;
      this.$("#f-arming_flash").checked = a.arming_flash === true;
      set("#f-button_single", a.button_single || "arm");
      set("#f-button_double", a.button_double || "disarm");
      set("#f-button_triple", a.button_triple || "none");
      set("#f-button_hold", a.button_hold || "none");
      this.$("#f-flood_siren").checked = a.flood_siren !== false;
      this.$("#f-notify_arm_disarm").checked = a.notify_arm_disarm === true;
      this.$("#f-critical_alerts").checked = a.critical_alerts !== false;

      const times = Array.isArray(a.health_check_times) ? a.health_check_times : [];
      this.$("#f-health_check_enabled").checked = a.health_check_enabled === true;
      set("#f-health_time1", times[0] || "09:00");
      set("#f-health_time2", times[1] || "21:00");
      set("#f-health_battery_threshold", a.health_battery_threshold !== undefined ? a.health_battery_threshold : 20);
      const days = Array.isArray(a.health_check_days) ? a.health_check_days : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      this.$$("#f-health_days input[type=checkbox]").forEach(cb => {
          cb.checked = days.includes(cb.value);
      });

      // One-line summaries for the collapsed section headers.
      const sum = (id, html) => { const el = this.$(id); if (el) el.innerHTML = html; };
      const exit = a.arming_delay !== undefined ? a.arming_delay : 30;
      const entry = a.entry_delay !== undefined ? a.entry_delay : 30;
      sum("#sum-timing", `exit ${exit}s · entry ${entry}s`);
      const vol = a.siren_volume !== undefined ? a.siren_volume : 100;
      const dur = a.siren_duration ? `${a.siren_duration}s` : "until disarmed";
      const tones = Object.keys(a.siren_tones || {}).length;
      sum("#sum-siren", `${tones || "default"} sound${tones === 1 ? "" : "s"} · ${vol}% · ${dur}`);
      const swatch = (c) => `<span class="dot" style="background:${c}"></span>`;
      sum("#sum-lights",
        `armed ${swatch(a.armed_light_color || "#ff0000")} · disarmed ` +
        (a.disarmed_lights_on ? swatch(a.disarmed_light_color || "#00c800") : "off") +
        (a.arming_flash ? " · flash" : ""));
      sum("#sum-flood", a.flood_siren !== false ? "siren on leak" : "notify only");
      sum("#sum-buttons", `single: ${a.button_single || "arm"} · double: ${a.button_double || "disarm"}`);
      const phones = (a.notify_services || []).length;
      sum("#sum-notify",
        `${phones} phone${phones === 1 ? "" : "s"}` +
        (a.critical_alerts !== false ? ` · <span class="oktext">critical on</span>` : " · critical off"));
      sum("#sum-health", a.health_check_enabled
        ? `<span class="oktext">on</span> · ${times.filter(Boolean).join(" & ") || "09:00"} · &lt;${a.health_battery_threshold !== undefined ? a.health_battery_threshold : 20}% battery`
        : "off");

      this._renderSirenControls();

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

  if (!customElements.get("fullstacksecurity-panel")) {
    customElements.define("fullstacksecurity-panel", FullStackSecurityPanel);
  }

  class FullStackSecurityCard extends HTMLElement {
    static getStubConfig() {
      return { entity: "alarm_control_panel.fullstack_security" };
    }

    setConfig(config) {
      this._config = config || {};
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      this._render();
    }

    getCardSize() {
      return 5;
    }

    _entityId() {
      if (this._config && this._config.entity && this._hass && this._hass.states && this._hass.states[this._config.entity]) {
        return this._config.entity;
      }
      const states = (this._hass && this._hass.states) || {};
      if (states["alarm_control_panel.fullstack_security"]) {
        return "alarm_control_panel.fullstack_security";
      }
      return Object.keys(states).find(
        (k) => k.startsWith("alarm_control_panel.") &&
          (k.includes("fullstack") || k.includes("full_stack"))
      );
    }

    _name(entityId, attrs = {}) {
      const s = (this._hass && this._hass.states) ? this._hass.states[entityId] : undefined;
      return (attrs.device_names || {})[entityId] ||
        (s && s.attributes.friendly_name) || entityId;
    }

    _deviceState(listKey, entityId) {
      return computeDeviceState(this._hass, listKey, entityId);
    }

    _render() {
      if (!this.shadowRoot || !this._hass) return;
      try {
        this._renderInner();
      } catch (err) {
        this.shadowRoot.innerHTML =
          `<ha-card><div style="padding:18px;color:var(--secondary-text-color)">FullStack Security card error: ${err && err.message ? err.message : err}</div></ha-card>`;
      }
    }

    _renderInner() {
      const id = this._entityId();
      const alarm = id ? this._hass.states[id] : undefined;
      if (!alarm) {
        this.shadowRoot.innerHTML = `<ha-card><div class="missing">FullStack Security entity not found.</div></ha-card>`;
        return;
      }
      const attrs = alarm.attributes || {};
      const rows = [];
      for (const [key, meta] of Object.entries(LISTS)) {
        for (const entityId of attrs[key] || []) {
          const st = this._deviceState(key, entityId);
          rows.push({
            key,
            meta,
            entityId,
            st,
            zone: (attrs.device_zones || {})[entityId] || "Unassigned",
          });
        }
      }
      const zones = [...new Set(rows.map((row) => row.zone))]
        .sort((a, b) => (a === "Unassigned") - (b === "Unassigned") || a.localeCompare(b));
      this.shadowRoot.innerHTML = `
        <style>
          ha-card { overflow: hidden; }
          .wrap { padding: 16px; }
          .head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
          .head ha-icon { --mdc-icon-size: 28px; color: var(--primary-color); }
          .title { flex: 1; min-width: 0; }
          .title h2 { margin: 0; font-size: 20px; font-weight: 500; }
          .title p { margin: 3px 0 0; color: var(--secondary-text-color); font-size: 13px; }
          .state { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 6px 10px; text-transform: uppercase; background: var(--secondary-background-color); }
          .row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--divider-color); }
          .row ha-icon { --mdc-icon-size: 20px; color: var(--secondary-text-color); flex: none; }
          .nm { flex: 1; min-width: 0; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .eid { display: block; font-size: 11px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; }
          .zone { margin: 14px 0 0; padding: 10px 0 3px; font-size: 11px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--secondary-text-color); border-top: 1px solid var(--divider-color); }
          .zone:first-of-type { margin-top: 0; }
          .pill { font-size: 11px; font-weight: 700; letter-spacing: .4px; padding: 4px 9px; border-radius: 999px; flex: none; }
          .safe { color: var(--success-color, #2e9e5b); background: color-mix(in srgb, var(--success-color, #2e9e5b) 14%, transparent); }
          .alert { color: var(--error-color, #e0442c); background: color-mix(in srgb, var(--error-color, #e0442c) 14%, transparent); }
          .warn { color: var(--warning-color, #f5a623); background: color-mix(in srgb, var(--warning-color, #f5a623) 16%, transparent); }
          .water { color: var(--info-color, #2196f3); background: color-mix(in srgb, var(--info-color, #2196f3) 14%, transparent); }
          .idle { color: var(--secondary-text-color); background: color-mix(in srgb, var(--secondary-text-color) 12%, transparent); }
          .missing, .empty { padding: 18px; color: var(--secondary-text-color); }
        </style>
        <ha-card>
          <div class="wrap">
            <div class="head">
              <ha-icon icon="mdi:shield-home"></ha-icon>
              <div class="title">
                <h2>${escapeHtml(alarm.attributes.friendly_name || "FullStack Security")}</h2>
                <p>${rows.length} configured device${rows.length === 1 ? "" : "s"}</p>
              </div>
              <span class="state">${String(alarm.state).replace(/_/g, " ")}</span>
            </div>
            ${rows.length ? zones.map((zone) => `
              <div class="zone">${escapeHtml(zone)}</div>
              ${rows.filter((row) => row.zone === zone).map((r) => `
                <div class="row">
                  <ha-icon icon="${r.meta.icon}"></ha-icon>
                  <span class="nm">${escapeHtml(this._name(r.entityId, attrs))}<span class="eid">${escapeHtml(r.entityId)}</span></span>
                  <span class="pill ${r.st.cls}">${r.st.text}</span>
                </div>`).join("")}`).join("") : `<div class="empty">No devices configured yet. Open Security in the sidebar and add devices.</div>`}
          </div>
        </ha-card>`;
    }
  }

  if (!customElements.get("fullstacksecurity-card")) {
    customElements.define("fullstacksecurity-card", FullStackSecurityCard);
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: "fullstacksecurity-card",
      name: "FullStack Security",
      description: "Alarm status plus configured sensor, siren, light and button states.",
    });
  }
})();
