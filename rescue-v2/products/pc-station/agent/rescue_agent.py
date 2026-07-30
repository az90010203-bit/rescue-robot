#!/usr/bin/env python3
"""Rescue V2 PC control agent.

This process owns the Pi lease. The Qt process is an untrusted local client:
if its heartbeat disappears, the agent stops the robot and releases the lease.
"""

from __future__ import annotations

import argparse
import json
import math
import signal
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

UI_WATCHDOG_SECONDS = 0.30
CONTROLLER_WATCHDOG_SECONDS = 0.12
CONTROLLER_CENTER_SECONDS = 0.50
CONTROLLER_ACTIVE_DEBOUNCE_SECONDS = 0.10
FRONT_LEG_INPUT_DEADBAND = 0.15
FRONT_LEG_SOURCE_CENTER_RAW = 1261
REAR_LEG_SOURCE_CENTER_RAW = 2994
FRONT_LEG_SOURCE_RAW_PER_REVOLUTION = 4096
FRONT_LEG_POSE_CENTER_MILLI_DEGREES = 180_000
FRONT_LEG_POSE_INTERVAL_SECONDS = 0.08
ARM_POSE_INTERVAL_SECONDS = 0.08
ARM_INPUT_DEADBAND = 0.05
ARM_PARK_THRESHOLD_MILLI = -950
WRIST_PARK_THRESHOLD_MILLI = -900
DRIVE_SPEED_MIN_PERCENT = 30
DRIVE_SPEED_MAX_PERCENT = 100
MECANUM_SPEED_MAX_PERCENT = 70
DEFAULT_MECANUM_SPEED_PERCENT = 50
DEFAULT_TRACKED_SPEED_PERCENT = 60
CONTROLLER_SPEED_LEVELS = {
    "mecanum": (30, 50, 70),
    "tracked": (30, 60, 100),
}


class AgentError(RuntimeError):
    pass


class PiClient:
    def __init__(self, host: str, port: int = 17353) -> None:
        self.base_url = f"http://{host}:{port}"

    def get(self, path: str, timeout: float = 0.8) -> dict[str, Any]:
        return self._request(path, None, timeout)

    def post(self, path: str, body: dict[str, Any], timeout: float = 0.8) -> dict[str, Any]:
        return self._request(path, body, timeout)

    def _request(self, path: str, body: dict[str, Any] | None, timeout: float) -> dict[str, Any]:
        data = None if body is None else json.dumps(body, separators=(",", ":")).encode()
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            method="GET" if body is None else "POST",
            headers={} if body is None else {"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                value = json.load(response)
        except urllib.error.HTTPError as error:
            try:
                detail = json.load(error)
            except Exception:
                detail = {"error": f"Pi HTTP {error.code}"}
            raise AgentError(str(detail.get("error") or f"Pi HTTP {error.code}")) from error
        except (OSError, TimeoutError) as error:
            raise AgentError(f"Pi unavailable: {error}") from error
        if not isinstance(value, dict):
            raise AgentError("Pi returned a non-object response")
        if value.get("ok") is False:
            raise AgentError(str(value.get("error") or "Pi rejected request"))
        return value


class ControllerReader:
    def __init__(self, port: str, baud: int = 115200, clock=time.monotonic) -> None:
        self._port_name = port
        self._baud = baud
        self._clock = clock
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._frame: dict[str, Any] | None = None
        self._received_at: float | None = None
        self._connected = False
        self._last_error: str | None = None

    def start(self) -> None:
        threading.Thread(target=self._run, name="esp32plus-controller", daemon=True).start()

    def close(self) -> None:
        self._stop.set()

    def current(self) -> dict[str, Any] | None:
        with self._lock:
            if self._received_at is None or self._clock() - self._received_at > CONTROLLER_WATCHDOG_SECONDS:
                return None
            return None if self._frame is None else dict(self._frame)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            age_ms = None if self._received_at is None else round((self._clock() - self._received_at) * 1000)
            return {
                "port": self._port_name,
                "connected": self._connected,
                "frameAgeMs": age_ms,
                "fresh": age_ms is not None and age_ms <= round(CONTROLLER_WATCHDOG_SECONDS * 1000),
                "lastFrame": self._frame,
                "lastError": self._last_error,
            }

    def _run(self) -> None:
        import serial

        while not self._stop.is_set():
            try:
                with serial.Serial(self._port_name, self._baud, timeout=0.1, write_timeout=0.2) as port:
                    with self._lock:
                        self._connected = True
                        self._last_error = None
                    port.write(b"M\n")
                    port.flush()
                    while not self._stop.is_set():
                        line = port.readline()
                        if not line:
                            continue
                        value = json.loads(line.decode("utf-8", errors="replace"))
                        if not isinstance(value, dict) or value.get("type") not in (
                            "dual_knob_mecanum",
                            "xiao_drive_controller",
                        ):
                            continue
                        with self._lock:
                            self._frame = value
                            self._received_at = self._clock()
            except Exception as error:
                with self._lock:
                    self._connected = False
                    self._last_error = str(error)
                self._stop.wait(1.0)


def map_controller_axes(
    frame: dict[str, Any],
    speed_limit_percent: int = DEFAULT_MECANUM_SPEED_PERCENT,
) -> tuple[str, int, int, int]:
    mode = "tracked" if frame.get("mode") == "tracked" else "mecanum"
    values = []
    for key in ("forward", "strafe", "turn"):
        try:
            value = float(frame.get(key, 0))
        except (TypeError, ValueError):
            value = 0.0
        values.append(max(-1.0, min(1.0, value if math.isfinite(value) else 0.0)))
    magnitude = math.sqrt(sum(value * value for value in values))
    if magnitude <= 0.0001:
        return mode, 0, 0, 0
    if magnitude > 1:
        values = [value / magnitude for value in values]
        magnitude = 1
    bounded_speed_limit = max(
        DRIVE_SPEED_MIN_PERCENT,
        min(
            DRIVE_SPEED_MAX_PERCENT if mode == "tracked" else MECANUM_SPEED_MAX_PERCENT,
            int(speed_limit_percent),
        ),
    )
    minimum_ratio = DRIVE_SPEED_MIN_PERCENT / bounded_speed_limit
    scale = minimum_ratio + (1 - minimum_ratio) * magnitude
    values = [round(value / magnitude * scale * 1000) for value in values]
    return mode, values[0], values[1], values[2]


def controller_speed_limit_percent(
    frame: dict[str, Any],
    mode: str,
    fallback_percent: int,
) -> int:
    levels = CONTROLLER_SPEED_LEVELS[mode]
    level = frame.get("speedLevel")
    if isinstance(level, bool) or not isinstance(level, int) or not 1 <= level <= len(levels):
        return fallback_percent
    return levels[level - 1]


def map_front_leg_direction(frame: dict[str, Any]) -> int:
    if frame.get("frontLegReady") is not True:
        return 0
    try:
        value = float(frame.get("frontLeg", 0))
    except (TypeError, ValueError):
        return 0
    if not math.isfinite(value):
        return 0
    if value >= FRONT_LEG_INPUT_DEADBAND:
        return 1
    if value <= -FRONT_LEG_INPUT_DEADBAND:
        return -1
    return 0


def map_front_leg_pose_milli_degrees(frame: dict[str, Any]) -> int | None:
    return map_leg_pose_milli_degrees(
        frame,
        value_key="frontLegRaw",
        ready_key="frontLegReady",
        center_raw=FRONT_LEG_SOURCE_CENTER_RAW,
    )


def map_rear_leg_direction(frame: dict[str, Any]) -> int:
    return map_leg_direction(frame, value_key="rearLeg", ready_key="rearLegReady")


def map_rear_leg_pose_milli_degrees(frame: dict[str, Any]) -> int | None:
    return map_leg_pose_milli_degrees(
        frame,
        value_key="rearLegRaw",
        ready_key="rearLegReady",
        center_raw=REAR_LEG_SOURCE_CENTER_RAW,
    )


def map_arm_j1_unit_milli(frame: dict[str, Any]) -> int | None:
    return map_arm_joint_unit_milli(
        frame,
        value_key="armJ1",
        ready_key="armJ1Ready",
    )


def map_arm_j2_unit_milli(frame: dict[str, Any]) -> int | None:
    return map_arm_joint_unit_milli(
        frame,
        value_key="armJ2",
        ready_key="armJ2Ready",
    )


def map_wrist_lift_unit_milli(frame: dict[str, Any]) -> int | None:
    return map_arm_joint_unit_milli(
        frame,
        value_key="wristLift",
        ready_key="wristLiftReady",
    )


def map_arm_joint_unit_milli(
    frame: dict[str, Any],
    *,
    value_key: str,
    ready_key: str,
) -> int | None:
    if frame.get(ready_key) is not True:
        return None
    try:
        value = float(frame.get(value_key, 0))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(value):
        return None
    value = max(-1.0, min(1.0, value))
    if abs(value) < ARM_INPUT_DEADBAND:
        return 0
    return round(value * 1000)


def arm_joint_is_active(unit_milli: int | None) -> bool:
    return unit_milli is not None and unit_milli > ARM_PARK_THRESHOLD_MILLI


def wrist_lift_is_active(unit_milli: int | None) -> bool:
    return unit_milli is not None and unit_milli > WRIST_PARK_THRESHOLD_MILLI


def controller_has_active_input(frame: dict[str, Any] | None) -> bool:
    if frame is None:
        return False
    return bool(
        any(map_controller_axes(frame)[1:])
        or map_front_leg_direction(frame) != 0
        or map_rear_leg_direction(frame) != 0
        or arm_joint_is_active(map_arm_j1_unit_milli(frame))
        or arm_joint_is_active(map_arm_j2_unit_milli(frame))
        or wrist_lift_is_active(map_wrist_lift_unit_milli(frame))
    )


def map_leg_direction(
    frame: dict[str, Any],
    *,
    value_key: str,
    ready_key: str,
) -> int:
    if frame.get(ready_key) is not True:
        return 0
    try:
        value = float(frame.get(value_key, 0))
    except (TypeError, ValueError):
        return 0
    if not math.isfinite(value):
        return 0
    if value >= FRONT_LEG_INPUT_DEADBAND:
        return 1
    if value <= -FRONT_LEG_INPUT_DEADBAND:
        return -1
    return 0


def map_leg_pose_milli_degrees(
    frame: dict[str, Any],
    *,
    value_key: str,
    ready_key: str,
    center_raw: int,
) -> int | None:
    if frame.get(ready_key) is not True:
        return None
    try:
        raw = int(frame.get(value_key))
    except (TypeError, ValueError):
        return None
    raw_delta = (raw - center_raw + 2048) % 4096 - 2048
    offset_milli_degrees = round(
        raw_delta
        * 360_000
        / FRONT_LEG_SOURCE_RAW_PER_REVOLUTION
    )
    return max(
        0,
        min(
            360_000,
            FRONT_LEG_POSE_CENTER_MILLI_DEGREES + offset_milli_degrees,
        ),
    )


class ControlAgent:
    def __init__(self, pi: PiClient, clock=time.monotonic, controller: ControllerReader | None = None) -> None:
        self._pi = pi
        self._clock = clock
        self._lock = threading.Lock()
        self._arm_lock = threading.Lock()
        self._lease_token: str | None = None
        self._sequence = 0
        self._last_ui_heartbeat: float | None = None
        self._last_error: str | None = None
        self._last_stop_reason = "startup"
        self._stop_count = 0
        self._drive_speed_limits = {
            "mecanum": DEFAULT_MECANUM_SPEED_PERCENT,
            "tracked": DEFAULT_TRACKED_SPEED_PERCENT,
        }
        self._controller = controller
        self._controller_was_active = False
        self._controller_was_drive_active = False
        self._controller_leg_was_active = {"front": False, "rear": False}
        self._controller_was_arm_j1_active = False
        self._controller_was_arm_j2_active = False
        self._controller_was_wrist_lift_active = False
        self._controller_rearm_blocked = True
        self._controller_centered_since: float | None = None
        self._controller_active_since: float | None = None
        self._last_leg_pose_at: dict[str, float | None] = {"front": None, "rear": None}
        self._last_arm_j1_pose_at: float | None = None
        self._last_arm_j2_pose_at: float | None = None
        self._last_wrist_lift_pose_at: float | None = None

    def heartbeat(self) -> None:
        with self._lock:
            self._last_ui_heartbeat = self._clock()

    def arm(self) -> dict[str, Any]:
        self._ensure_armed()
        return {"ok": True, "armed": True}

    def drive(self, body: dict[str, Any]) -> dict[str, Any]:
        controller_frame = None if self._controller is None else self._controller.current()
        if controller_has_active_input(controller_frame):
            return {"ok": True, "accepted": False, "reason": "esp32plus_has_priority"}
        self._ensure_armed()
        with self._lock:
            token = self._lease_token
            if not self._ui_fresh_locked():
                raise AgentError("Qt heartbeat is stale")
            self._sequence += 1
            sequence = self._sequence
        command = {
            "leaseToken": token,
            "sequence": sequence,
            "forwardMilli": require_int(body, "forwardMilli", -1000, 1000),
            "strafeMilli": require_int(body, "strafeMilli", -1000, 1000),
            "turnMilli": require_int(body, "turnMilli", -1000, 1000),
            "speedLimitPercent": require_int(
                body,
                "speedLimitPercent",
                DRIVE_SPEED_MIN_PERCENT,
                MECANUM_SPEED_MAX_PERCENT,
            ),
            "deadman": body.get("deadman") is True,
        }
        return self._pi.post("/v2/control/drive", command)

    def capability(self, name: str, body: dict[str, Any]) -> dict[str, Any]:
        if name == "wrist-center" and self._controller is not None:
            controller_frame = self._controller.current()
            if wrist_lift_is_active(
                map_wrist_lift_unit_milli(controller_frame)
            ):
                raise AgentError(
                    "controller ID13 must be at its wrist start position"
                )
        if name == "tracked" and self._controller is not None:
            controller_frame = self._controller.current()
            if controller_has_active_input(controller_frame):
                return {
                    "ok": True,
                    "accepted": False,
                    "reason": "esp32plus_has_priority",
                }
        if name not in ("imu", "feetech"):
            self._ensure_armed()
        with self._lock:
            if not self._ui_fresh_locked():
                raise AgentError("Qt heartbeat is stale")
            token = self._lease_token
            self._sequence += 1
            sequence = self._sequence
        paths = {
            "tracked": "/v2/control/tracked",
            "arm": "/v2/control/arm-jog",
            "claw": "/v2/control/claw",
            "wrist": "/v2/control/wrist-pose",
            "wrist-center": "/v2/control/wrist-calibrate-center",
            "gimbal": "/v2/control/gimbal-jog",
            "can": "/v2/control/can-jog",
            "imu": "/v2/telemetry/imu",
            "feetech": "/v2/telemetry/feetech",
        }
        path = paths.get(name)
        if path is None:
            raise AgentError(f"unknown capability: {name}")
        command = dict(body)
        if name == "tracked":
            command["leftMilli"] = require_int(body, "leftMilli", -1000, 1000)
            command["rightMilli"] = require_int(body, "rightMilli", -1000, 1000)
            command["speedLimitPercent"] = require_int(
                body,
                "speedLimitPercent",
                DRIVE_SPEED_MIN_PERCENT,
                DRIVE_SPEED_MAX_PERCENT,
            )
        command["sequence"] = sequence
        if token is not None:
            command["leaseToken"] = token
        return self._pi.post(path, command)

    def set_speed_limits(self, body: dict[str, Any]) -> dict[str, Any]:
        mecanum = require_int(
            body,
            "mecanumPercent",
            DRIVE_SPEED_MIN_PERCENT,
            MECANUM_SPEED_MAX_PERCENT,
        )
        tracked = require_int(
            body,
            "trackedPercent",
            DRIVE_SPEED_MIN_PERCENT,
            DRIVE_SPEED_MAX_PERCENT,
        )
        with self._lock:
            self._drive_speed_limits = {"mecanum": mecanum, "tracked": tracked}
        return {"ok": True, "speedLimits": {"mecanum": mecanum, "tracked": tracked}}

    def stop(self, reason: str) -> dict[str, Any]:
        with self._lock:
            had_lease = self._lease_token is not None
            self._lease_token = None
            self._sequence = 0
            self._last_stop_reason = reason
            self._stop_count += 1
            self._controller_rearm_blocked = True
            self._controller_centered_since = None
            self._controller_active_since = None
            self._controller_was_active = False
            self._controller_was_drive_active = False
            self._controller_leg_was_active = {"front": False, "rear": False}
            self._controller_was_arm_j1_active = False
            self._controller_was_arm_j2_active = False
            self._controller_was_wrist_lift_active = False
            self._last_leg_pose_at = {"front": None, "rear": None}
            self._last_arm_j1_pose_at = None
            self._last_arm_j2_pose_at = None
            self._last_wrist_lift_pose_at = None
        if had_lease:
            try:
                self._pi.post("/v2/control/stop", {"reason": reason})
            except AgentError as error:
                with self._lock:
                    self._last_error = str(error)
                raise
        return {"ok": True, "armed": False}

    def watchdog_step(self) -> None:
        with self._lock:
            token = self._lease_token
            ui_fresh = self._ui_fresh_locked()
            should_stop = token is not None and not ui_fresh
        if should_stop:
            try:
                self.stop("qt_heartbeat_timeout")
            except AgentError:
                pass
            return
        if token is not None:
            try:
                self._pi.post("/v2/control/keepalive", {"leaseToken": token})
            except AgentError as error:
                with self._lock:
                    if self._lease_token == token:
                        self._lease_token = None
                        self._sequence = 0
                        self._last_stop_reason = "pi_keepalive_failed"
                    self._last_error = str(error)
                return
        self._controller_step()

    def health(self) -> dict[str, Any]:
        try:
            pi_health = self._pi.get("/v2/health")
            pi_online = True
            error = None
        except AgentError as caught:
            pi_health = None
            pi_online = False
            error = str(caught)
        with self._lock:
            pi_armed = bool(pi_health and pi_health.get("armed"))
            if self._lease_token is not None and (not pi_online or not pi_armed):
                self._lease_token = None
                self._sequence = 0
                self._last_stop_reason = "pi_lease_lost"
            heartbeat_age_ms = None
            if self._last_ui_heartbeat is not None:
                heartbeat_age_ms = round((self._clock() - self._last_ui_heartbeat) * 1000)
            return {
                "ok": pi_online,
                "service": "rescue-v2-control-agent",
                "version": "0.1.0",
                "armed": self._lease_token is not None and pi_online and pi_armed,
                "qtHeartbeatAgeMs": heartbeat_age_ms,
                "qtHeartbeatFresh": self._ui_fresh_locked(),
                "lastStopReason": self._last_stop_reason,
                "stopCount": self._stop_count,
                "speedLimits": dict(self._drive_speed_limits),
                "lastError": self._last_error or error,
                "controller": None if self._controller is None else self._controller.snapshot(),
                "pi": pi_health,
            }

    def _ui_fresh_locked(self) -> bool:
        return (
            self._last_ui_heartbeat is not None
            and self._clock() - self._last_ui_heartbeat <= UI_WATCHDOG_SECONDS
        )

    def _ensure_armed(self) -> str:
        with self._arm_lock:
            with self._lock:
                if not self._ui_fresh_locked():
                    raise AgentError("Qt heartbeat is stale")
                if self._lease_token is not None:
                    return self._lease_token
            value = self._pi.post("/v2/control/arm", {})
            token = value.get("leaseToken")
            if not isinstance(token, str) or not token:
                raise AgentError("Pi did not issue a lease")
            with self._lock:
                if not self._ui_fresh_locked():
                    raise AgentError("Qt heartbeat is stale")
                self._lease_token = token
                self._sequence = 0
                self._last_error = None
                return token

    def _controller_step(self) -> None:
        if self._controller is None:
            return
        frame = self._controller.current()
        with self._lock:
            token = self._lease_token
            ui_fresh = self._ui_fresh_locked()
        if not ui_fresh:
            self._controller_was_active = False
            self._controller_was_drive_active = False
            self._controller_leg_was_active = {"front": False, "rear": False}
            self._controller_was_arm_j1_active = False
            self._controller_was_arm_j2_active = False
            self._controller_was_wrist_lift_active = False
            self._last_leg_pose_at = {"front": None, "rear": None}
            self._last_arm_j1_pose_at = None
            self._last_arm_j2_pose_at = None
            self._last_wrist_lift_pose_at = None
            return
        if frame is None:
            if self._controller_was_active:
                try:
                    self.stop("esp32plus_timeout")
                except AgentError:
                    pass
            self._controller_was_active = False
            self._controller_was_drive_active = False
            self._controller_leg_was_active = {"front": False, "rear": False}
            self._controller_was_arm_j1_active = False
            self._controller_was_arm_j2_active = False
            self._controller_was_wrist_lift_active = False
            self._last_leg_pose_at = {"front": None, "rear": None}
            self._last_arm_j1_pose_at = None
            self._last_arm_j2_pose_at = None
            self._last_wrist_lift_pose_at = None
            return
        requested_mode = "tracked" if frame.get("mode") == "tracked" else "mecanum"
        with self._lock:
            configured_speed_limit = self._drive_speed_limits[requested_mode]
        speed_limit_percent = controller_speed_limit_percent(
            frame,
            requested_mode,
            configured_speed_limit,
        )
        mode, forward, strafe, turn = map_controller_axes(frame, speed_limit_percent)
        drive_active = bool(forward or strafe or turn)
        leg_states = {
            "front": (
                map_front_leg_direction(frame),
                map_front_leg_pose_milli_degrees(frame),
            ),
            "rear": (
                map_rear_leg_direction(frame),
                map_rear_leg_pose_milli_degrees(frame),
            ),
        }
        arm_j1_unit_milli = map_arm_j1_unit_milli(frame)
        arm_j1_active = arm_joint_is_active(arm_j1_unit_milli)
        arm_j2_unit_milli = map_arm_j2_unit_milli(frame)
        arm_j2_active = arm_joint_is_active(arm_j2_unit_milli)
        wrist_lift_unit_milli = map_wrist_lift_unit_milli(frame)
        wrist_lift_active = wrist_lift_is_active(wrist_lift_unit_milli)
        active = (
            drive_active
            or any(direction != 0 for direction, _pose in leg_states.values())
            or arm_j1_active
            or arm_j2_active
            or wrist_lift_active
        )
        now = self._clock()
        with self._lock:
            if not active:
                if self._controller_centered_since is None:
                    self._controller_centered_since = now
                if now - self._controller_centered_since >= CONTROLLER_CENTER_SECONDS:
                    self._controller_rearm_blocked = False
                self._controller_active_since = None
            else:
                self._controller_centered_since = None
                if self._controller_rearm_blocked:
                    self._controller_active_since = None
                elif self._controller_active_since is None:
                    self._controller_active_since = now
            rearm_blocked = self._controller_rearm_blocked
            active_since = self._controller_active_since
        active_confirmed = (
            active
            and not rearm_blocked
            and active_since is not None
            and now - active_since >= CONTROLLER_ACTIVE_DEBOUNCE_SECONDS
        )
        if active and not active_confirmed:
            self._controller_was_active = False
            return
        if token is None and active_confirmed:
            try:
                token = self._ensure_armed()
            except AgentError as error:
                with self._lock:
                    self._last_error = str(error)
                return
        if token is None:
            self._controller_was_active = False
            return
        if not active and not self._controller_was_active:
            return
        try:
            if drive_active or self._controller_was_drive_active:
                sequence = self._next_sequence()
                if mode == "tracked":
                    left = max(-1000, min(1000, forward + turn))
                    right = max(-1000, min(1000, forward - turn))
                    self._pi.post(
                        "/v2/control/tracked",
                        {
                            "leaseToken": token,
                            "sequence": sequence,
                            "leftMilli": left,
                            "rightMilli": right,
                            "speedLimitPercent": speed_limit_percent,
                        },
                    )
                else:
                    self._pi.post(
                        "/v2/control/drive",
                        {
                            "leaseToken": token,
                            "sequence": sequence,
                            "forwardMilli": forward,
                            "strafeMilli": strafe,
                            "turnMilli": turn,
                            "speedLimitPercent": speed_limit_percent,
                            "deadman": True,
                        },
                    )
            self._controller_was_drive_active = drive_active
            for group, (direction, pose_milli_degrees) in leg_states.items():
                leg_active = direction != 0
                was_active = self._controller_leg_was_active[group]
                should_send_pose = (
                    pose_milli_degrees is not None
                    and (leg_active or was_active)
                    and (
                        not leg_active
                        or self._last_leg_pose_at[group] is None
                        or now - self._last_leg_pose_at[group] >= FRONT_LEG_POSE_INTERVAL_SECONDS
                    )
                )
                if should_send_pose:
                    self._last_leg_pose_at[group] = now
                    self._pi.post(
                        "/v2/control/can-pose",
                        {
                            "leaseToken": token,
                            "sequence": self._next_sequence(),
                            "group": group,
                            "angleMilliDeg": pose_milli_degrees,
                            "speedRaw": 0,
                        },
                    )
                if not leg_active:
                    self._last_leg_pose_at[group] = None
                self._controller_leg_was_active[group] = leg_active
            should_send_arm_j1 = (
                arm_j1_unit_milli is not None
                and (arm_j1_active or self._controller_was_arm_j1_active)
                and (
                    not arm_j1_active
                    or self._last_arm_j1_pose_at is None
                    or now - self._last_arm_j1_pose_at >= ARM_POSE_INTERVAL_SECONDS
                )
            )
            if should_send_arm_j1:
                self._last_arm_j1_pose_at = now
                self._pi.post(
                    "/v2/control/arm-pose",
                    {
                        "leaseToken": token,
                        "sequence": self._next_sequence(),
                        "joint": "j1",
                        "unitMilli": arm_j1_unit_milli,
                    },
                )
            if not arm_j1_active:
                self._last_arm_j1_pose_at = None
            self._controller_was_arm_j1_active = arm_j1_active
            should_send_arm_j2 = (
                arm_j2_unit_milli is not None
                and (arm_j2_active or self._controller_was_arm_j2_active)
                and (
                    not arm_j2_active
                    or self._last_arm_j2_pose_at is None
                    or now - self._last_arm_j2_pose_at >= ARM_POSE_INTERVAL_SECONDS
                )
            )
            if should_send_arm_j2:
                self._last_arm_j2_pose_at = now
                self._pi.post(
                    "/v2/control/arm-pose",
                    {
                        "leaseToken": token,
                        "sequence": self._next_sequence(),
                        "joint": "j2",
                        "unitMilli": arm_j2_unit_milli,
                    },
                )
            if not arm_j2_active:
                self._last_arm_j2_pose_at = None
            self._controller_was_arm_j2_active = arm_j2_active
            should_send_wrist_lift = (
                wrist_lift_unit_milli is not None
                and (
                    wrist_lift_active
                    or self._controller_was_wrist_lift_active
                )
                and (
                    not wrist_lift_active
                    or self._last_wrist_lift_pose_at is None
                    or now - self._last_wrist_lift_pose_at
                    >= ARM_POSE_INTERVAL_SECONDS
                )
            )
            if should_send_wrist_lift:
                self._last_wrist_lift_pose_at = now
                self._pi.post(
                    "/v2/control/wrist-pose",
                    {
                        "leaseToken": token,
                        "sequence": self._next_sequence(),
                        "action": "lift",
                        "liftUnitMilli": (
                            wrist_lift_unit_milli
                            if wrist_lift_active
                            else -1000
                        ),
                    },
                )
            if not wrist_lift_active:
                self._last_wrist_lift_pose_at = None
            self._controller_was_wrist_lift_active = wrist_lift_active
            self._controller_was_active = active
        except AgentError as error:
            with self._lock:
                self._last_error = str(error)

    def _next_sequence(self) -> int:
        with self._lock:
            self._sequence += 1
            return self._sequence


def create_handler(agent: ControlAgent) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        server_version = "RescueV2Agent/0.1"
        protocol_version = "HTTP/1.1"

        def do_GET(self) -> None:
            if self.path == "/v2/health":
                self._json(200, agent.health())
            else:
                self._json(404, {"ok": False, "error": "not_found"})

        def do_POST(self) -> None:
            try:
                body = self._read_json()
                if self.path == "/v2/ui/heartbeat":
                    agent.heartbeat()
                    self._json(200, {"ok": True})
                elif self.path == "/v2/control/arm":
                    self._json(200, agent.arm())
                elif self.path == "/v2/control/drive":
                    self._json(200, agent.drive(body))
                elif self.path == "/v2/control/speed-limits":
                    self._json(200, agent.set_speed_limits(body))
                elif self.path == "/v2/control/stop":
                    self._json(200, agent.stop(str(body.get("reason") or "qt_operator")))
                elif self.path.startswith("/v2/capability/"):
                    self._json(200, agent.capability(self.path.rsplit("/", 1)[-1], body))
                else:
                    self._json(404, {"ok": False, "error": "not_found"})
            except (
                BrokenPipeError,
                ConnectionAbortedError,
                ConnectionResetError,
            ):
                self.close_connection = True
            except (AgentError, TypeError, ValueError, json.JSONDecodeError) as error:
                self._json(400, {"ok": False, "error": str(error)})
            except Exception as error:
                self._json(500, {"ok": False, "error": str(error)})

        def log_message(self, message: str, *args: Any) -> None:
            if sys.stdout is not None:
                print(f"{self.client_address[0]} {message % args}", flush=True)

        def _read_json(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 <= length <= 8192:
                raise ValueError("request body is too large")
            value = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(value, dict):
                raise TypeError("JSON body must be an object")
            return value

        def _json(self, status: int, value: dict[str, Any]) -> None:
            payload = json.dumps(value, separators=(",", ":")).encode()
            try:
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            except (
                BrokenPipeError,
                ConnectionAbortedError,
                ConnectionResetError,
            ):
                self.close_connection = True

    return Handler


def require_int(body: dict[str, Any], key: str, minimum: int, maximum: int) -> int:
    value = body.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{key} must be an integer")
    if not minimum <= value <= maximum:
        raise ValueError(f"{key} is outside [{minimum}, {maximum}]")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pi-host", default="192.168.55.131")
    parser.add_argument("--listen", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=18400)
    parser.add_argument("--controller-port", default="COM5")
    args = parser.parse_args()

    controller = ControllerReader(args.controller_port)
    controller.start()
    agent = ControlAgent(PiClient(args.pi_host), controller=controller)
    server = ThreadingHTTPServer((args.listen, args.port), create_handler(agent))
    stop_event = threading.Event()

    def watchdog() -> None:
        while not stop_event.wait(0.05):
            agent.watchdog_step()

    threading.Thread(target=watchdog, name="ui-watchdog", daemon=True).start()

    def shutdown(_signum: int, _frame: Any) -> None:
        stop_event.set()
        try:
            agent.stop("agent_shutdown")
        finally:
            threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)
    if sys.stdout is not None:
        print(f"rescue-v2 control agent listening on {args.listen}:{args.port}", flush=True)
    try:
        server.serve_forever(0.2)
    finally:
        stop_event.set()
        try:
            agent.stop("agent_shutdown")
        except AgentError:
            pass
        controller.close()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
