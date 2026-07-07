"""Flood alert binary sensor for FullStack Security.

Water leak monitoring is always active, armed or not. When any configured
flood sensor turns wet this entity turns on, sounds the sirens (if enabled)
and sends phone notifications - the same output devices the alarm uses.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_ON
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import (
    async_track_state_change_event,
    async_track_time_interval,
)
from homeassistant.util import dt as dt_util

from .const import (
    CONF_FLOOD,
    CONF_FLOOD_SIREN,
    CONF_SIREN_DURATION,
    CONF_SIREN_TONE,
    CONF_SIREN_VOLUME,
    CONF_SIRENS,
    EVENT_FLOOD,
    get_notify_services,
    opt,
)
from .helpers import async_notify_all, async_sirens_off, async_sirens_on, friendly_name

_LOGGER = logging.getLogger(__name__)

# Re-send siren turn_on on this interval; zigbee sirens auto-stop otherwise.
SIREN_REFRESH_SECONDS = 3


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up the flood alert sensor from a config entry."""
    async_add_entities([FloodAlertSensor(entry)])


class FloodAlertSensor(BinarySensorEntity):
    """On while any configured water leak sensor is wet."""

    _attr_name = "FullStack Security Flood Alert"
    _attr_device_class = BinarySensorDeviceClass.MOISTURE
    _attr_should_poll = False
    _attr_icon = "mdi:water-alert"

    def __init__(self, entry: ConfigEntry) -> None:
        options = entry.options
        self._attr_unique_id = f"{entry.entry_id}_flood"
        self._flood: list[str] = list(opt(options, CONF_FLOOD))
        self._sirens: list[str] = list(opt(options, CONF_SIRENS))
        self._siren_tone = str(opt(options, CONF_SIREN_TONE))
        self._siren_duration = int(opt(options, CONF_SIREN_DURATION))
        self._siren_volume = int(opt(options, CONF_SIREN_VOLUME))
        self._flood_siren = bool(opt(options, CONF_FLOOD_SIREN))
        self._notify_services = get_notify_services(options)
        self._attr_is_on = False
        self._siren_started = False
        self._siren_loop_cancel = None

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if self._flood:
            self.async_on_remove(
                async_track_state_change_event(self.hass, self._flood, self._flood_changed)
            )
        # Pick up sensors that are already wet at startup without re-alerting.
        self._attr_is_on = bool(self._wet_sensors())

    async def async_will_remove_from_hass(self) -> None:
        self._stop_siren_loop()

    def _stop_siren_loop(self) -> None:
        if self._siren_loop_cancel:
            self._siren_loop_cancel()
            self._siren_loop_cancel = None

    def _start_siren_loop(self) -> None:
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
            if not self._attr_is_on or not self._siren_started:
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

    def _wet_sensors(self) -> list[str]:
        return [
            e
            for e in self._flood
            if (s := self.hass.states.get(e)) and s.state == STATE_ON
        ]

    @property
    def extra_state_attributes(self):
        return {
            "flood_sensors": self._flood,
            "wet_sensors": self._wet_sensors(),
        }

    @callback
    def _flood_changed(self, event) -> None:
        if event.data.get("old_state") is None or event.data.get("new_state") is None:
            return
        wet = self._wet_sensors()
        was_on = self._attr_is_on
        self._attr_is_on = bool(wet)
        self.async_write_ha_state()

        if wet and not was_on:
            self.hass.async_create_task(self._async_alert(wet))
        elif not wet and was_on:
            self.hass.async_create_task(self._async_clear())

    async def _async_alert(self, wet: list[str]) -> None:
        names = ", ".join(friendly_name(self.hass, e) for e in wet)
        _LOGGER.warning("FLOOD DETECTED: %s", names)
        self.hass.bus.async_fire(EVENT_FLOOD, {"sensors": wet, "names": names})

        if self._flood_siren and self._sirens:
            self._siren_started = True
            await async_sirens_on(
                self.hass, self._sirens, self._siren_tone, self._siren_duration,
                self._siren_volume,
            )
            self._start_siren_loop()

        await async_notify_all(
            self.hass,
            self._notify_services,
            "💧 WATER LEAK DETECTED",
            f"Water detected by: {names}",
        )

    async def _async_clear(self) -> None:
        _LOGGER.info("Flood cleared")
        self._stop_siren_loop()
        if self._siren_started:
            self._siren_started = False
            # Do not silence a siren the burglar alarm may be running.
            alarm = next(
                (
                    s
                    for s in self.hass.states.async_all("alarm_control_panel")
                    if s.entity_id.startswith("alarm_control_panel.fullstack")
                ),
                None,
            )
            if not alarm or alarm.state != "triggered":
                await async_sirens_off(self.hass, self._sirens)

        await async_notify_all(
            self.hass,
            self._notify_services,
            "💧 Water leak cleared",
            "All flood sensors are dry again.",
        )
