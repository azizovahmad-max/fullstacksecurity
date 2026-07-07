"""Alarm control panel entity for FullStack Security."""

from __future__ import annotations

import json
import logging
from datetime import timedelta

from homeassistant.components.alarm_control_panel import (
    AlarmControlPanelEntity,
    AlarmControlPanelEntityFeature,
    AlarmControlPanelState,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_ENTITY_ID, STATE_ON
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import (
    async_call_later,
    async_track_state_change_event,
    async_track_time_change,
    async_track_time_interval,
)
from homeassistant.helpers.restore_state import RestoreEntity
from homeassistant.util import dt as dt_util

from .const import (
    CONF_ARMED_LIGHT_COLOR,
    CONF_ARMED_LIGHTS,
    CONF_ARMING_DELAY,
    CONF_BUTTON_DOUBLE,
    CONF_BUTTON_HOLD,
    CONF_BUTTON_SINGLE,
    CONF_BUTTON_TRIPLE,
    CONF_BUTTONS,
    CONF_MQTT_BUTTONS,
    CONF_DOORS,
    CONF_ENTRY_DELAY,
    CONF_FLOOD,
    CONF_FLOOD_SIREN,
    CONF_LIGHT_DURATION,
    CONF_LIGHT_MODE,
    CONF_LIGHTS,
    CONF_NOTIFY_ARM_DISARM,
    CONF_SCHEDULES,
    CONF_SCHEDULES_ENABLED,
    CONF_SIREN_DURATION,
    CONF_SIREN_TONE,
    CONF_SIREN_VOLUME,
    CONF_SIRENS,
    CONF_VIBRATION,
    DOMAIN,
    EVENT_FLOOD,
    EVENT_TRIGGERED,
    WEEKDAYS,
    get_notify_services,
    opt,
)
from .helpers import async_notify_all, async_sirens_off, async_sirens_on, friendly_name

_LOGGER = logging.getLogger(__name__)

RESTORABLE_STATES = {
    AlarmControlPanelState.ARMED_AWAY,
    AlarmControlPanelState.TRIGGERED,
}

MAX_HISTORY = 25

# Many zigbee sirens auto-stop after their own internal duration no matter
# what we ask for, so while the alarm is triggered we re-send turn_on on this
# interval to keep them sounding.
SIREN_REFRESH_SECONDS = 3


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up the alarm panel from a config entry."""
    async_add_entities([FullStackSecurityAlarm(entry)])


def _classify_button_press(raw: str) -> str | None:
    """Map a zigbee2mqtt button action value to single/double/triple/hold."""
    value = (raw or "").lower()
    if not value or value in ("unknown", "unavailable", "none"):
        return None
    if "triple" in value:
        return "triple"
    if "double" in value:
        return "double"
    if "hold" in value or "long" in value:
        return "hold"
    if "single" in value or "press" in value or value in ("on", "click", "toggle"):
        return "single"
    return None


def _hex_to_rgb(color: str) -> list[int]:
    """Convert #rrggbb to [r, g, b]; falls back to red."""
    try:
        c = color.lstrip("#")
        return [int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)]
    except (ValueError, IndexError):
        return [255, 0, 0]


class FullStackSecurityAlarm(AlarmControlPanelEntity, RestoreEntity):
    """The armed/disarmed brain of the security system."""

    _attr_name = "FullStack Security"
    _attr_should_poll = False
    _attr_code_arm_required = False
    _attr_code_format = None
    _attr_supported_features = (
        AlarmControlPanelEntityFeature.ARM_AWAY | AlarmControlPanelEntityFeature.TRIGGER
    )
    _attr_icon = "mdi:shield-home"

    def __init__(self, entry: ConfigEntry) -> None:
        options = entry.options
        self._attr_unique_id = entry.entry_id
        self._attr_alarm_state = AlarmControlPanelState.DISARMED

        self._doors: list[str] = list(opt(options, CONF_DOORS))
        self._vibration: list[str] = list(opt(options, CONF_VIBRATION))
        self._flood: list[str] = list(opt(options, CONF_FLOOD))
        self._sirens: list[str] = list(opt(options, CONF_SIRENS))
        self._lights: list[str] = list(opt(options, CONF_LIGHTS))
        self._armed_lights: list[str] = list(opt(options, CONF_ARMED_LIGHTS))
        self._buttons: list[str] = list(opt(options, CONF_BUTTONS))
        self._mqtt_buttons: list[str] = list(opt(options, CONF_MQTT_BUTTONS))

        self._arming_delay = int(opt(options, CONF_ARMING_DELAY))
        self._entry_delay = int(opt(options, CONF_ENTRY_DELAY))
        self._siren_duration = int(opt(options, CONF_SIREN_DURATION))
        self._siren_tone = str(opt(options, CONF_SIREN_TONE))
        self._siren_volume = int(opt(options, CONF_SIREN_VOLUME))
        self._light_mode = str(opt(options, CONF_LIGHT_MODE))
        self._light_duration = int(opt(options, CONF_LIGHT_DURATION))
        self._armed_light_color = str(opt(options, CONF_ARMED_LIGHT_COLOR))
        self._flood_siren = bool(opt(options, CONF_FLOOD_SIREN))
        self._notify_services = get_notify_services(options)
        self._notify_arm_disarm = bool(opt(options, CONF_NOTIFY_ARM_DISARM))
        self._button_actions = {
            "single": opt(options, CONF_BUTTON_SINGLE),
            "double": opt(options, CONF_BUTTON_DOUBLE),
            "triple": opt(options, CONF_BUTTON_TRIPLE),
            "hold": opt(options, CONF_BUTTON_HOLD),
        }
        self._schedules_enabled = bool(opt(options, CONF_SCHEDULES_ENABLED))
        schedules = opt(options, CONF_SCHEDULES)
        self._schedules: dict = schedules if isinstance(schedules, dict) else {}

        self._delay_ends_at = None
        self._delay_total = 0
        self._last_triggered_by: str | None = None
        self._timer_cancel = None
        self._siren_loop_cancel = None
        self._history: list[dict] = []

    # ------------------------------------------------------------------ setup

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()

        last = await self.async_get_last_state()
        if last:
            hist = last.attributes.get("history")
            if isinstance(hist, list):
                self._history = hist[-MAX_HISTORY:]
            if last.state in [s.value for s in RESTORABLE_STATES]:
                self._attr_alarm_state = AlarmControlPanelState(last.state)
                _LOGGER.info("Restored alarm state: %s", last.state)
                if last.state == AlarmControlPanelState.ARMED_AWAY.value:
                    # Re-apply the armed indicator lights after a restart.
                    self.hass.async_create_task(self._async_armed_lights_on())

        watched = self._doors + self._vibration + self._buttons
        if watched:
            self.async_on_remove(
                async_track_state_change_event(self.hass, watched, self._watched_changed)
            )

        # Log flood events from the flood monitor into the activity history.
        self.async_on_remove(
            self.hass.bus.async_listen(EVENT_FLOOD, self._flood_event)
        )

        # Minute tick for the auto-arm schedule.
        self.async_on_remove(
            async_track_time_change(self.hass, self._schedule_tick, second=0)
        )

        # Subscribe to zigbee2mqtt button topics directly. Many z2m buttons
        # (e.g. TS004F) only publish their presses to MQTT and never create an
        # HA entity, so watching state changes is not enough.
        if self._mqtt_buttons:
            self.hass.async_create_task(self._async_subscribe_mqtt_buttons())

    async def _async_subscribe_mqtt_buttons(self) -> None:
        """Subscribe to each configured z2m button MQTT topic."""
        try:
            from homeassistant.components import mqtt
        except ImportError:
            _LOGGER.error("MQTT integration unavailable; z2m buttons disabled")
            return
        try:
            if not await mqtt.async_wait_for_mqtt_client(self.hass):
                _LOGGER.error(
                    "MQTT client not connected; z2m buttons %s will not work",
                    self._mqtt_buttons,
                )
                return
        except Exception as err:  # noqa: BLE001 - never break setup over MQTT
            _LOGGER.error("Could not wait for MQTT client: %s", err)
            return

        for name in self._mqtt_buttons:
            topic = name if "/" in name else f"zigbee2mqtt/{name}"
            try:
                unsub = await mqtt.async_subscribe(
                    self.hass, topic, self._mqtt_button_message
                )
            except Exception as err:  # noqa: BLE001 - one bad topic must not kill the rest
                _LOGGER.error("Failed to subscribe to %s: %s", topic, err)
                continue
            self.async_on_remove(unsub)
            _LOGGER.info("Subscribed to z2m button topic %s", topic)

    @callback
    def _mqtt_button_message(self, msg) -> None:
        """Handle an incoming z2m button MQTT payload."""
        # Ignore retained messages so a stale action can't fire on (re)connect.
        if getattr(msg, "retain", False):
            return
        try:
            data = json.loads(msg.payload)
        except (ValueError, TypeError):
            return
        if not isinstance(data, dict):
            return
        action = data.get("action")
        if not action:
            return
        press = _classify_button_press(str(action))
        if press is None:
            _LOGGER.debug("MQTT button %s: unmapped action %s", msg.topic, action)
            return
        _LOGGER.debug("MQTT button %s: %s -> press %s", msg.topic, action, press)
        self._apply_button_press(press)

    async def async_will_remove_from_hass(self) -> None:
        self._cancel_timer()
        self._stop_siren_loop()

    def _stop_siren_loop(self) -> None:
        if self._siren_loop_cancel:
            self._siren_loop_cancel()
            self._siren_loop_cancel = None

    def _start_siren_loop(self) -> None:
        """Keep the sirens sounding until duration elapses or we disarm.

        Zigbee sirens usually have their own internal auto-off, so a single
        turn_on is not enough - re-send it periodically.
        """
        self._stop_siren_loop()
        if not self._sirens:
            return
        until = (
            None
            if self._siren_duration <= 0
            else dt_util.utcnow() + timedelta(seconds=self._siren_duration)
        )

        @callback
        def _refresh(_now) -> None:
            if self._attr_alarm_state != AlarmControlPanelState.TRIGGERED:
                self._stop_siren_loop()
                return
            if until and dt_util.utcnow() >= until:
                self._stop_siren_loop()
                self.hass.async_create_task(async_sirens_off(self.hass, self._sirens))
                return
            self.hass.async_create_task(
                async_sirens_on(
                    self.hass, self._sirens, self._siren_tone,
                    self._siren_duration, self._siren_volume,
                )
            )

        self._siren_loop_cancel = async_track_time_interval(
            self.hass, _refresh, timedelta(seconds=SIREN_REFRESH_SECONDS)
        )

    def _cancel_timer(self) -> None:
        if self._timer_cancel:
            self._timer_cancel()
            self._timer_cancel = None
        self._delay_ends_at = None
        self._delay_total = 0

    # ---------------------------------------------------------------- history

    @callback
    def _log(self, icon: str, text: str) -> None:
        self._history.append(
            {"t": dt_util.utcnow().isoformat(), "i": icon, "m": text}
        )
        self._history = self._history[-MAX_HISTORY:]

    @callback
    def _flood_event(self, event) -> None:
        names = event.data.get("names", "flood sensor")
        self._log("water", f"Water leak detected by {names}")
        self.async_write_ha_state()

    # ------------------------------------------------------------- readiness

    def _blocking_sensors(self) -> tuple[list[str], list[str], list[str]]:
        """Return (open, dead, nodata) security sensors.

        Open and dead block arming. "unknown" (nodata) just means no report
        since the last restart - normal for zigbee2mqtt sensors without
        retained MQTT messages - so it is surfaced but does not block.
        """
        open_sensors: list[str] = []
        dead_sensors: list[str] = []
        nodata_sensors: list[str] = []
        for entity_id in self._doors + self._vibration:
            state = self.hass.states.get(entity_id)
            if state is None or state.state == "unavailable":
                dead_sensors.append(entity_id)
            elif state.state == "unknown":
                nodata_sensors.append(entity_id)
            elif state.state == STATE_ON:
                open_sensors.append(entity_id)
        return open_sensors, dead_sensors, nodata_sensors

    # ------------------------------------------------------------- attributes

    @property
    def extra_state_attributes(self):
        open_sensors, dead_sensors, nodata_sensors = self._blocking_sensors()
        return {
            "doors": self._doors,
            "vibration": self._vibration,
            "flood": self._flood,
            "sirens": self._sirens,
            "lights": self._lights,
            "armed_lights": self._armed_lights,
            "buttons": self._buttons,
            "mqtt_buttons": self._mqtt_buttons,
            "arming_delay": self._arming_delay,
            "entry_delay": self._entry_delay,
            "siren_duration": self._siren_duration,
            "siren_tone": self._siren_tone,
            "siren_volume": self._siren_volume,
            "light_mode": self._light_mode,
            "light_duration": self._light_duration,
            "armed_light_color": self._armed_light_color,
            "flood_siren": self._flood_siren,
            "notify_services": self._notify_services,
            "notify_arm_disarm": self._notify_arm_disarm,
            "button_single": self._button_actions["single"],
            "button_double": self._button_actions["double"],
            "button_triple": self._button_actions["triple"],
            "button_hold": self._button_actions["hold"],
            "schedules_enabled": self._schedules_enabled,
            "schedules": self._schedules,
            "open_sensors": open_sensors,
            "unavailable_sensors": dead_sensors,
            "nodata_sensors": nodata_sensors,
            "delay_ends_at": self._delay_ends_at.isoformat() if self._delay_ends_at else None,
            "delay_total": self._delay_total,
            "last_triggered_by": self._last_triggered_by,
            "history": self._history,
        }

    # ----------------------------------------------------------- sensor logic

    @callback
    def _watched_changed(self, event) -> None:
        entity_id = event.data.get("entity_id")
        new_state = event.data.get("new_state")
        old_state = event.data.get("old_state")
        if new_state is None or old_state is None:
            # Ignore startup/registration churn so a HA restart can't arm or
            # trigger anything by itself.
            return

        if entity_id in self._buttons:
            self._handle_button(new_state)
            return

        if new_state.state != STATE_ON:
            # A sensor closing never changes the alarm, but the open_sensors
            # attribute should refresh for the UI.
            self.async_write_ha_state()
            return

        state = self._attr_alarm_state
        if state == AlarmControlPanelState.ARMED_AWAY:
            if self._entry_delay > 0:
                self._start_entry_delay(entity_id)
            else:
                self.hass.async_create_task(self._async_trigger(entity_id))
        elif state == AlarmControlPanelState.DISARMED:
            self.async_write_ha_state()

    @callback
    def _handle_button(self, new_state) -> None:
        domain = new_state.entity_id.split(".", 1)[0]
        if domain in ("button", "input_button"):
            raw = new_state.state
            press = "single"
        elif domain == "event":
            raw = new_state.attributes.get("event_type", "")
            press = _classify_button_press(str(raw))
        else:
            raw = new_state.state
            press = _classify_button_press(str(raw))
        if press is None:
            return
        _LOGGER.debug("Button %s: %s -> press %s", new_state.entity_id, raw, press)
        self._apply_button_press(press)

    @callback
    def _apply_button_press(self, press: str) -> None:
        """Run the configured arm/disarm/toggle action for a button press."""
        action = self._button_actions.get(press, "none")
        if action == "toggle":
            action = (
                "disarm"
                if self._attr_alarm_state != AlarmControlPanelState.DISARMED
                else "arm"
            )
        if action == "arm":
            self.hass.async_create_task(self.async_alarm_arm_away())
        elif action == "disarm":
            self.hass.async_create_task(self.async_alarm_disarm())

    # --------------------------------------------------------------- schedule

    @callback
    def _schedule_tick(self, now) -> None:
        """Check the weekly schedule once a minute (local time)."""
        if not self._schedules_enabled or not self._schedules:
            return
        local = dt_util.as_local(now)
        hhmm = local.strftime("%H:%M")
        today = WEEKDAYS[local.weekday()]
        yesterday = WEEKDAYS[(local.weekday() - 1) % 7]

        def row(day):
            r = self._schedules.get(day)
            return r if isinstance(r, dict) and r.get("enabled") else None

        t = row(today)
        y = row(yesterday)

        # Arm at today's arm time.
        if t and t.get("arm") == hhmm:
            if self._attr_alarm_state == AlarmControlPanelState.DISARMED:
                self._log("clock", "Auto-armed by schedule")
                self.hass.async_create_task(self.async_alarm_arm_away(auto=True))
            return

        # Disarm: same-day window (disarm > arm) fires today; overnight window
        # (disarm <= arm) fires the next day.
        disarm_now = False
        if t and t.get("disarm") == hhmm and t.get("disarm", "") > t.get("arm", ""):
            disarm_now = True
        if y and y.get("disarm") == hhmm and y.get("disarm", "") <= y.get("arm", ""):
            disarm_now = True

        if disarm_now and self._attr_alarm_state in (
            AlarmControlPanelState.ARMED_AWAY,
            AlarmControlPanelState.ARMING,
            AlarmControlPanelState.PENDING,
        ):
            self._log("clock", "Auto-disarmed by schedule")
            self.hass.async_create_task(self.async_alarm_disarm(auto=True))

    # ------------------------------------------------------------ arm/disarm

    async def async_alarm_arm_away(self, code=None, auto: bool = False) -> None:
        if self._attr_alarm_state not in (
            AlarmControlPanelState.DISARMED,
            AlarmControlPanelState.ARMING,
        ):
            return

        open_sensors, dead_sensors, _nodata = self._blocking_sensors()
        if open_sensors or dead_sensors:
            parts = []
            if open_sensors:
                parts.append(
                    "open: "
                    + ", ".join(friendly_name(self.hass, e) for e in open_sensors)
                )
            if dead_sensors:
                parts.append(
                    "offline: "
                    + ", ".join(friendly_name(self.hass, e) for e in dead_sensors)
                )
            reason = " / ".join(parts)
            _LOGGER.warning("Cannot arm - %s", reason)
            self._log("alert", f"Arming refused - {reason}")
            await async_notify_all(
                self.hass,
                self._notify_services,
                "Security",
                f"Cannot arm - {reason}",
            )
            self.async_write_ha_state()
            return

        if self._arming_delay <= 0 or auto:
            await self._async_set_armed(auto=auto)
            return

        self._cancel_timer()
        self._attr_alarm_state = AlarmControlPanelState.ARMING
        self._delay_total = self._arming_delay
        self._delay_ends_at = dt_util.utcnow() + timedelta(seconds=self._arming_delay)
        self.async_write_ha_state()

        @callback
        def _finish_arming(_now) -> None:
            self._timer_cancel = None
            self.hass.async_create_task(self._async_set_armed())

        self._timer_cancel = async_call_later(self.hass, self._arming_delay, _finish_arming)

    async def _async_set_armed(self, auto: bool = False) -> None:
        self._cancel_timer()
        self._attr_alarm_state = AlarmControlPanelState.ARMED_AWAY
        self._log("shield", "Armed by schedule" if auto else "System armed")
        self.async_write_ha_state()
        _LOGGER.info("FullStack Security armed (away)")

        await self._async_armed_lights_on()
        if self._notify_arm_disarm:
            await async_notify_all(
                self.hass, self._notify_services, "Security", "System armed"
            )

    async def _async_armed_lights_on(self) -> None:
        if not self._armed_lights:
            return
        try:
            await self.hass.services.async_call(
                "light",
                "turn_on",
                {
                    ATTR_ENTITY_ID: self._armed_lights,
                    "rgb_color": _hex_to_rgb(self._armed_light_color),
                },
                blocking=False,
            )
        except Exception as err:  # noqa: BLE001 - color support varies per bulb
            _LOGGER.warning("Armed light color failed (%s), plain turn_on", err)
            await self.hass.services.async_call(
                "light", "turn_on", {ATTR_ENTITY_ID: self._armed_lights}, blocking=False
            )

    async def async_alarm_disarm(self, code=None, auto: bool = False) -> None:
        was = self._attr_alarm_state
        self._cancel_timer()
        self._stop_siren_loop()
        self._attr_alarm_state = AlarmControlPanelState.DISARMED
        self._last_triggered_by = None
        if was != AlarmControlPanelState.DISARMED:
            self._log("shield-off", "Disarmed by schedule" if auto else "System disarmed")
        self.async_write_ha_state()
        _LOGGER.info("FullStack Security disarmed")

        if was == AlarmControlPanelState.TRIGGERED:
            await async_sirens_off(self.hass, self._sirens)
            if self._lights:
                await self.hass.services.async_call(
                    "homeassistant",
                    "turn_off",
                    {ATTR_ENTITY_ID: self._lights},
                    blocking=False,
                )
        if was != AlarmControlPanelState.DISARMED and self._armed_lights:
            await self.hass.services.async_call(
                "homeassistant",
                "turn_off",
                {ATTR_ENTITY_ID: self._armed_lights},
                blocking=False,
            )
        if was != AlarmControlPanelState.DISARMED and self._notify_arm_disarm:
            await async_notify_all(
                self.hass, self._notify_services, "Security", "System disarmed"
            )

    async def async_alarm_trigger(self, code=None) -> None:
        await self._async_trigger("manual")

    # ---------------------------------------------------------- entry delay

    @callback
    def _start_entry_delay(self, entity_id: str) -> None:
        self._cancel_timer()
        self._attr_alarm_state = AlarmControlPanelState.PENDING
        self._last_triggered_by = entity_id
        self._delay_total = self._entry_delay
        self._delay_ends_at = dt_util.utcnow() + timedelta(seconds=self._entry_delay)
        self.async_write_ha_state()
        _LOGGER.info("Entry delay started by %s (%ss)", entity_id, self._entry_delay)

        @callback
        def _entry_expired(_now) -> None:
            self._timer_cancel = None
            if self._attr_alarm_state == AlarmControlPanelState.PENDING:
                self.hass.async_create_task(self._async_trigger(entity_id))

        self._timer_cancel = async_call_later(self.hass, self._entry_delay, _entry_expired)

    # -------------------------------------------------------------- trigger

    async def _async_trigger(self, source_entity: str) -> None:
        if self._attr_alarm_state == AlarmControlPanelState.DISARMED:
            return
        self._cancel_timer()
        self._attr_alarm_state = AlarmControlPanelState.TRIGGERED
        self._last_triggered_by = source_entity

        name = (
            "manual trigger"
            if source_entity == "manual"
            else friendly_name(self.hass, source_entity)
        )
        self._log("alarm", f"ALARM triggered by {name}")
        self.async_write_ha_state()
        _LOGGER.warning("ALARM TRIGGERED by %s", name)
        self.hass.bus.async_fire(EVENT_TRIGGERED, {"source": source_entity, "name": name})

        await async_sirens_on(
            self.hass, self._sirens, self._siren_tone, self._siren_duration,
            self._siren_volume,
        )
        self._start_siren_loop()

        if self._lights:
            data: dict = {ATTR_ENTITY_ID: self._lights}
            if self._light_mode == "flash_long":
                data["flash"] = "long"
            elif self._light_mode == "flash_short":
                data["flash"] = "short"
            elif self._light_mode == "solid_red":
                data["color_name"] = "red"
            elif self._light_mode == "solid_white":
                data["color_name"] = "white"
            try:
                await self.hass.services.async_call("light", "turn_on", data, blocking=False)
            except Exception as err:  # noqa: BLE001 - bad flash/color support varies
                _LOGGER.warning("Light action failed (%s), retrying plain turn_on", err)
                await self.hass.services.async_call(
                    "light", "turn_on", {ATTR_ENTITY_ID: self._lights}, blocking=False
                )

            if self._light_duration > 0:

                @callback
                def _lights_timeout(_now) -> None:
                    if self._attr_alarm_state == AlarmControlPanelState.TRIGGERED:
                        self.hass.async_create_task(
                            self.hass.services.async_call(
                                "homeassistant",
                                "turn_off",
                                {ATTR_ENTITY_ID: self._lights},
                                blocking=False,
                            )
                        )

                async_call_later(self.hass, self._light_duration, _lights_timeout)

        await async_notify_all(
            self.hass,
            self._notify_services,
            "🚨 ALARM TRIGGERED",
            f"{name} detected activity while the system was armed.",
        )
