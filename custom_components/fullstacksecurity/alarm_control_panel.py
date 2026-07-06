import logging
from datetime import timedelta
from homeassistant.components.alarm_control_panel import (
    AlarmControlPanelEntity,
    AlarmControlPanelEntityFeature,
)
from homeassistant.const import (
    STATE_ALARM_DISARMED,
    STATE_ALARM_ARMING,
    STATE_ALARM_ARMED_AWAY,
    STATE_ALARM_TRIGGERED,
    STATE_ON,
    STATE_OFF,
    ATTR_ENTITY_ID,
)
from homeassistant.helpers.event import async_track_state_change_event, async_call_later
from homeassistant.core import callback

_LOGGER = logging.getLogger(__name__)

DOMAIN = "fullstacksecurity"

async def async_setup_entry(hass, config_entry, async_add_entities):
    """Set up the FullStackSecurity alarm control panel from a config entry."""
    options = config_entry.options
    async_add_entities([FullStackSecurityAlarm(hass, options)], True)

class FullStackSecurityAlarm(AlarmControlPanelEntity):
    """Representation of a FullStackSecurity alarm."""

    def __init__(self, hass, options):
        """Initialize the alarm."""
        self.hass = hass
        self._name = "FullStack Security"
        self._state = STATE_ALARM_DISARMED
        
        self._doors = options.get("doors", [])
        self._vibrations = options.get("vibration", [])
        self._sirens = options.get("sirens", [])
        self._lights = options.get("lights", [])
        self._buttons = options.get("buttons", [])
        
        notify_option = options.get("notify", "")
        self._notifiers = [n.strip() for n in notify_option.split(",") if n.strip()] if notify_option else []
        
        self._arming_timer = None
        self._unsub_listener = None

    async def async_added_to_hass(self):
        """Run when entity about to be added to hass."""
        
        @callback
        def async_sensor_changed(event):
            """Handle sensor state changes."""
            entity_id = event.data.get("entity_id")
            new_state = event.data.get("new_state")
            if new_state is None:
                return

            # Handle security sensors (doors, vibration)
            if entity_id in self._doors or entity_id in self._vibrations:
                if self._state == STATE_ALARM_ARMED_AWAY and new_state.state == STATE_ON:
                    self.hass.async_create_task(self._async_trigger_alarm(entity_id))
            
            # Handle buttons
            if entity_id in self._buttons:
                action = new_state.state.lower()
                if action == "single":
                    self.hass.async_create_task(self.async_alarm_arm_away())
                elif action == "double":
                    self.hass.async_create_task(self.async_alarm_disarm())

        # Track all configured sensors and buttons
        all_entities = self._doors + self._vibrations + self._buttons
        if all_entities:
            self._unsub_listener = async_track_state_change_event(
                self.hass, all_entities, async_sensor_changed
            )
            self.async_on_remove(self._unsub_listener)

    @property
    def name(self):
        """Return the name of the device."""
        return self._name

    @property
    def state(self):
        """Return the state of the device."""
        return self._state

    @property
    def supported_features(self) -> int:
        """Return the list of supported features."""
        return AlarmControlPanelEntityFeature.ARM_AWAY

    async def async_alarm_disarm(self, code=None):
        """Send disarm command."""
        self._state = STATE_ALARM_DISARMED
        if self._arming_timer:
            self._arming_timer()
            self._arming_timer = None
        
        # Turn off sirens and lights
        if self._sirens:
            await self.hass.services.async_call("homeassistant", "turn_off", {ATTR_ENTITY_ID: self._sirens}, blocking=False)
        if self._lights:
            await self.hass.services.async_call("homeassistant", "turn_off", {ATTR_ENTITY_ID: self._lights}, blocking=False)
            
        self.async_write_ha_state()
        _LOGGER.info("FullStackSecurity is disarmed.")

    async def async_alarm_arm_away(self, code=None):
        """Send arm away command."""
        # Check if all sensors are closed/still
        open_sensors = []
        for sensor_id in (self._doors + self._vibrations):
            state = self.hass.states.get(sensor_id)
            if state and state.state == STATE_ON:
                open_sensors.append(sensor_id)
        
        if open_sensors:
            _LOGGER.warning(f"Cannot arm FullStackSecurity. Sensors are open: {open_sensors}")
            for notifier in self._notifiers:
                domain, service = notifier.split(".", 1)
                await self.hass.services.async_call(
                    domain, service,
                    {"message": f"Cannot arm system. Sensors open: {', '.join(open_sensors)}"},
                    blocking=False
                )
            return

        self._state = STATE_ALARM_ARMING
        self.async_write_ha_state()
        _LOGGER.info("FullStackSecurity is arming. 30 seconds delay.")

        @callback
        def _arm_system(now):
            self._state = STATE_ALARM_ARMED_AWAY
            self._arming_timer = None
            self.async_write_ha_state()
            _LOGGER.info("FullStackSecurity is now armed away.")

        self._arming_timer = async_call_later(self.hass, 30, _arm_system)

    async def _async_trigger_alarm(self, trigger_entity):
        """Trigger the alarm."""
        self._state = STATE_ALARM_TRIGGERED
        self.async_write_ha_state()
        _LOGGER.warning(f"FullStackSecurity TRIGGERED by {trigger_entity}!")

        # Turn on sirens
        if self._sirens:
            await self.hass.services.async_call("homeassistant", "turn_on", {ATTR_ENTITY_ID: self._sirens}, blocking=False)
        
        # Turn on lights
        if self._lights:
            await self.hass.services.async_call("homeassistant", "turn_on", {ATTR_ENTITY_ID: self._lights}, blocking=False)
        
        # Notify
        friendly_name = trigger_entity
        state_obj = self.hass.states.get(trigger_entity)
        if state_obj and state_obj.name:
            friendly_name = state_obj.name

        for notifier in self._notifiers:
            domain, service = notifier.split(".", 1)
            await self.hass.services.async_call(
                domain, service,
                {"message": f"ALARM TRIGGERED! Sensor {friendly_name} detected activity."},
                blocking=False
            )
