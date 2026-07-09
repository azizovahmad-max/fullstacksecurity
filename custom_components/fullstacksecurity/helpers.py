"""Shared helpers for FullStack Security."""

from __future__ import annotations

import logging

from homeassistant.const import ATTR_ENTITY_ID
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


def friendly_name(hass: HomeAssistant, entity_id: str) -> str:
    """Return the friendly name of an entity, falling back to its id."""
    state = hass.states.get(entity_id)
    if state and state.name:
        return state.name
    return entity_id


async def async_notify_all(
    hass: HomeAssistant,
    services: list[str],
    title: str,
    message: str,
    *,
    critical: bool = False,
    actions: list[dict] | None = None,
    tag: str | None = None,
) -> None:
    """Send a notification through every configured notify service.

    critical=True adds the companion-app keys that make the alert break
    through Do Not Disturb / silent mode on both platforms (Android ignores
    the iOS "push" block and vice versa). actions adds tappable buttons;
    tag lets a later message replace or clear this one.
    """
    data: dict = {}
    if critical:
        data.update(
            {
                # Android: high priority + the alarm_stream channel plays at
                # full alarm volume even in Do Not Disturb.
                "priority": "high",
                "ttl": 0,
                "channel": "alarm_stream",
                "importance": "high",
                # iOS: critical push breaks through Do Not Disturb / silent.
                "push": {
                    "sound": {"name": "default", "critical": 1, "volume": 1.0},
                    "interruption-level": "critical",
                },
            }
        )
    if actions:
        data["actions"] = actions
    if tag:
        data["tag"] = tag

    payload: dict = {"title": title, "message": message}
    if data:
        payload["data"] = data

    for notifier in services:
        if "." not in notifier:
            notifier = f"notify.{notifier}"
        domain, service = notifier.split(".", 1)
        try:
            await hass.services.async_call(domain, service, payload, blocking=False)
        except Exception as err:  # noqa: BLE001 - one bad notifier must not stop the rest
            _LOGGER.error("Failed to notify via %s: %s", notifier, err)


async def async_clear_notification(
    hass: HomeAssistant, services: list[str], tag: str
) -> None:
    """Remove a tagged notification from companion-app phones."""
    for notifier in services:
        if "." not in notifier:
            notifier = f"notify.{notifier}"
        domain, service = notifier.split(".", 1)
        if not service.startswith("mobile_app"):
            continue  # only the companion app understands clear_notification
        try:
            await hass.services.async_call(
                domain,
                service,
                {"message": "clear_notification", "data": {"tag": tag}},
                blocking=False,
            )
        except Exception as err:  # noqa: BLE001
            _LOGGER.error("Failed to clear notification via %s: %s", notifier, err)


async def async_sirens_on(
    hass: HomeAssistant,
    sirens: list[str],
    tone: str,
    duration: int,
    volume: int = 100,
) -> None:
    """Turn on sirens; real siren entities get tone/duration/volume, switches a plain on.

    volume is a percentage (0-100) mapped to siren volume_level (0.0-1.0).
    """
    real_sirens = [e for e in sirens if e.startswith("siren.")]
    others = [e for e in sirens if not e.startswith("siren.")]

    if real_sirens:
        data: dict = {ATTR_ENTITY_ID: real_sirens}
        if tone:
            data["tone"] = tone
        if duration:
            data["duration"] = duration
        if volume is not None and int(volume) < 100:
            data["volume_level"] = max(0, min(100, int(volume))) / 100
        try:
            await hass.services.async_call("siren", "turn_on", data, blocking=False)
        except Exception as err:  # noqa: BLE001 - some sirens reject tone/duration
            _LOGGER.warning("siren.turn_on with options failed (%s), retrying plain", err)
            await hass.services.async_call(
                "siren", "turn_on", {ATTR_ENTITY_ID: real_sirens}, blocking=False
            )
    if others:
        await hass.services.async_call(
            "homeassistant", "turn_on", {ATTR_ENTITY_ID: others}, blocking=False
        )


async def async_sirens_off(hass: HomeAssistant, sirens: list[str]) -> None:
    """Turn off all configured sirens."""
    if sirens:
        await hass.services.async_call(
            "homeassistant", "turn_off", {ATTR_ENTITY_ID: sirens}, blocking=False
        )
