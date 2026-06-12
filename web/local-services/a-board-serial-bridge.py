#!/usr/bin/env python3
from collections import deque
import json
import os
import queue
import select
import sys
import termios
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVICE = "a-board-serial-bridge"
VERSION = "0.1.0"
SERIAL_PORT = os.environ.get("A_BOARD_SERIAL_PORT", "/dev/ttyAMA5")
BAUD_RATE = int(os.environ.get("A_BOARD_BAUD", "115200"))
HOST = os.environ.get("A_BOARD_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("A_BOARD_BRIDGE_PORT", "17353"))
DEFAULT_TIMEOUT_MS = int(os.environ.get("A_BOARD_TIMEOUT_MS", "1200"))
REQUEST_WAIT_MARGIN_SEC = float(os.environ.get("A_BOARD_REQUEST_WAIT_MARGIN_SEC", "2.0"))
RECONNECT_INTERVAL_SEC = float(os.environ.get("A_BOARD_RECONNECT_INTERVAL_SEC", "1.0"))
SERIAL_EVENT_LIMIT = int(os.environ.get("A_BOARD_SERIAL_EVENT_LIMIT", "80"))
SERIAL_PROTOCOL_MODE = os.environ.get("A_BOARD_SERIAL_PROTOCOL", "auto").strip().lower()
if SERIAL_PROTOCOL_MODE not in ("auto", "json", "binary"):
    SERIAL_PROTOCOL_MODE = "auto"
PROTOCOL_VERSION = 1
PROTOCOL_PROBE_TIMEOUT_MS = int(os.environ.get("A_BOARD_PROTOCOL_PROBE_TIMEOUT_MS", "350"))
CAN_SERVO_GROUP_MAX_TARGETS = 8
MOTOR_CHANNEL_COUNT = 8

BAUD_FLAGS = {
    9600: termios.B9600,
    19200: termios.B19200,
    38400: termios.B38400,
    57600: termios.B57600,
    115200: termios.B115200,
}

TERMINAL_TYPES = ("error", "protocol.feedback", "motor.feedback", "mecanum.feedback", "can.feedback", "can.frame", "can_servo.feedback", "imu.feedback")
ACK_ONLY_COMMANDS = ("debug.set", "system.ping")
LATEST_WINS_TYPES = ("motor.target", "mecanum.target", "can_servo.move", "can_servo.group_move")
STOP_TYPES = ("motor.stop", "mecanum.stop")
LOW_PRIORITY_TYPES = ("imu.read",)
VALID_COMMAND_CLASSES = ("motor", "arm-servo", "can-servo", "telemetry", "system")
VALID_COMMAND_POLICIES = ("fifo", "latest", "stop")
COMMAND_CLASS_PRIORITIES = {
    "system": 100,
    "motor": 80,
    "arm-servo": 60,
    "can-servo": 40,
    "telemetry": 20,
}
COMMAND_TYPE_PRIORITIES = {
    "motor.stop": 100,
    "mecanum.stop": 100,
    "system.protocol": 100,
    "system.ping": 100,
    "motor.target": 80,
    "mecanum.target": 80,
    "motor.set": 80,
    "motor.config": 80,
    "servo.move": 60,
    "servo.speed": 60,
    "servo.torque": 60,
    "can_servo.config": 40,
    "can_servo.move": 40,
    "can_servo.group_move": 40,
    "can_servo.set_current": 40,
    "can_servo.pid": 40,
    "can_servo.set_id": 40,
    "can_servo.save_center": 40,
    "can_servo.factory_reset": 40,
    "can_servo.read": 20,
    "motor.read": 20,
    "can.read": 20,
    "imu.read": 20,
}

BINARY_TARGETS = {
    "system": 0x00,
    "base": 0x01,
    "motor": 0x02,
    "can-servo-group": 0x03,
    "can-servo": 0x04,
    "imu": 0x05,
}
BINARY_OPCODES = {
    "stop": 0x10,
    "mecanum.velocity": 0x11,
    "motor.target": 0x20,
    "can_servo.group_move": 0x30,
    "can_servo.read": 0x31,
    "imu.read": 0x40,
    "system.ping": 0x70,
    "system.sync_manifest_version": 0x71,
}
BINARY_FLAG_LATEST_WINS = 0x01
BINARY_FLAG_REQUIRES_ACK = 0x02
BINARY_FLAG_PRIORITY = 0x04
CAN_SERVO_READ_REQUEST_CODES = {
    "id": 0,
    "position": 1,
    "current": 2,
    "position_current": 3,
    "frames": 4,
}


def command_payload(command):
    payload = command.get("payload")
    return payload if isinstance(payload, dict) else command


def translate_command(command):
    if not isinstance(command, dict):
        return command
    command_type = command.get("type")
    payload = command_payload(command)
    seq = command.get("seq", payload.get("seq"))
    if command_type == "motor.set":
        translated = dict(command)
        translated["type"] = "motor.target"
        return translated
    if command_type == "mecanum-drive.set_velocity":
        return {
            "type": "mecanum.target",
            "seq": seq,
            "forward": payload.get("forward", 0),
            "strafe": payload.get("strafe", 0),
            "turn": payload.get("turn", 0),
            "speedLimitPercent": payload.get("speedLimitPercent", 100),
            "stopMode": payload.get("stopMode", command.get("stopMode", "coast")),
        }
    if command_type == "mecanum-drive.stop":
        return {
            "type": "mecanum.stop",
            "seq": seq,
            "stopMode": payload.get("stopMode", command.get("stopMode", "coast")),
        }
    return command


def crc16_ccitt_false(data):
    crc = 0xFFFF
    for byte in data:
        crc ^= (byte & 0xFF) << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return crc & 0xFFFF


def cobs_encode(data):
    if not data:
        return b"\x01"
    output = bytearray()
    code_index = 0
    output.append(0)
    code = 1
    for byte in data:
        byte &= 0xFF
        if byte == 0:
            output[code_index] = code
            code_index = len(output)
            output.append(0)
            code = 1
            continue
        output.append(byte)
        code += 1
        if code == 0xFF:
            output[code_index] = code
            code_index = len(output)
            output.append(0)
            code = 1
    output[code_index] = code
    return bytes(output)


def clamp_int(value, minimum, maximum, fallback=0):
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError, OverflowError):
        number = fallback
    return max(minimum, min(maximum, number))


def stop_mode_byte(value):
    return 1 if value == "brake" else 0


def axis_milli(value):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        number = 0
    return clamp_int(number * 1000, -1000, 1000)


def u8(value):
    return bytes([clamp_int(value, 0, 255) & 0xFF])


def u16_le(value):
    return clamp_int(value, 0, 0xFFFF).to_bytes(2, "little", signed=False)


def i16_le(value):
    return clamp_int(value, -32768, 32767).to_bytes(2, "little", signed=True)


def seq_u16(command):
    return clamp_int(command.get("seq"), 0, 0xFFFF)


def motor_channel_u8(value):
    channel = str(value or "").strip().upper()
    if channel.startswith("M") and channel[1:].isdigit():
        index = int(channel[1:])
        if 1 <= index <= 8:
            return index
    raise ValueError("binary motor.target supports channels M1-M8")


def command_class(command):
    if not isinstance(command, dict):
        return "system"
    explicit = str(command.get("commandClass", "")).strip()
    if explicit in VALID_COMMAND_CLASSES:
        return explicit
    command_type = str(command.get("type", "")).strip()
    if command_type in LOW_PRIORITY_TYPES or command_type in ("can_servo.read", "motor.read", "can.read") or command_type == "imu.read":
        return "telemetry"
    if command_type.startswith("motor.") or command_type.startswith("mecanum."):
        return "motor"
    if command_type.startswith("servo."):
        return "arm-servo"
    if command_type.startswith("can_servo."):
        return "can-servo"
    return "system"


def command_policy(command):
    if not isinstance(command, dict):
        return "fifo"
    explicit = str(command.get("policy", "")).strip()
    if explicit in VALID_COMMAND_POLICIES:
        return explicit
    command_type = command.get("type")
    if command_type in STOP_TYPES:
        return "stop"
    if command_type in LATEST_WINS_TYPES:
        return "latest"
    return "fifo"


def command_priority(command):
    if not isinstance(command, dict):
        return COMMAND_CLASS_PRIORITIES["system"]
    explicit = command.get("priority")
    if explicit is not None:
        return clamp_int(explicit, 0, 1000, COMMAND_CLASS_PRIORITIES[command_class(command)])
    command_type = str(command.get("type", "")).strip()
    if command_type in COMMAND_TYPE_PRIORITIES:
        return COMMAND_TYPE_PRIORITIES[command_type]
    return COMMAND_CLASS_PRIORITIES[command_class(command)]


def build_binary_payload(command):
    if isinstance(command, dict) and any(key in command for key in ("priority", "commandClass", "policy")):
        return None
    command_type = command.get("type")
    if command_type == "mecanum.target":
        return (
            BINARY_TARGETS["base"],
            BINARY_OPCODES["mecanum.velocity"],
            BINARY_FLAG_LATEST_WINS,
            b"".join([
                i16_le(axis_milli(command.get("forward", 0))),
                i16_le(axis_milli(command.get("strafe", 0))),
                i16_le(axis_milli(command.get("turn", 0))),
                u8(command.get("speedLimitPercent", 100)),
                u8(stop_mode_byte(command.get("stopMode", "coast"))),
            ]),
        )
    if command_type == "mecanum.stop":
        return (
            BINARY_TARGETS["base"],
            BINARY_OPCODES["stop"],
            BINARY_FLAG_REQUIRES_ACK | BINARY_FLAG_PRIORITY,
            u8(stop_mode_byte(command.get("stopMode", "coast"))),
        )
    if command_type == "motor.target":
        if "closedLoop" in command or "targetRpm" in command:
            return None
        return (
            BINARY_TARGETS["motor"],
            BINARY_OPCODES["motor.target"],
            BINARY_FLAG_LATEST_WINS,
            b"".join([
                u8(motor_channel_u8(command.get("channel"))),
                i16_le(command.get("speedPercent", 0)),
                u8(stop_mode_byte(command.get("stopMode", "coast"))),
            ]),
        )
    if command_type == "can_servo.group_move":
        targets = command.get("targets")
        if not isinstance(targets, list) or not targets:
            raise ValueError("can_servo.group_move requires at least one target")
        if len(targets) > CAN_SERVO_GROUP_MAX_TARGETS:
            raise ValueError("can_servo.group_move supports at most %s targets" % CAN_SERVO_GROUP_MAX_TARGETS)
        payload = bytearray()
        payload.append(len(targets) & 0xFF)
        for target in targets:
            if not isinstance(target, dict):
                raise ValueError("can_servo.group_move targets must be objects")
            payload.extend(u8(target.get("id")))
            payload.extend(u16_le(target.get("position")))
        payload.extend(u16_le(command.get("speed", 0)))
        return (
            BINARY_TARGETS["can-servo-group"],
            BINARY_OPCODES["can_servo.group_move"],
            BINARY_FLAG_LATEST_WINS,
            bytes(payload),
        )
    if command_type == "can_servo.read":
        request = str(command.get("request", "position_current")).strip() or "position_current"
        request_code = CAN_SERVO_READ_REQUEST_CODES.get(request)
        if request_code is None:
            return None
        return (
            BINARY_TARGETS["can-servo"],
            BINARY_OPCODES["can_servo.read"],
            BINARY_FLAG_REQUIRES_ACK,
            b"".join([
                u8(command.get("id", 0xFE)),
                u8(request_code),
            ]),
        )
    if command_type == "imu.read":
        return (
            BINARY_TARGETS["imu"],
            BINARY_OPCODES["imu.read"],
            0,
            u8(command.get("requestFlags", 0)),
        )
    if command_type == "system.ping":
        return (
            BINARY_TARGETS["system"],
            BINARY_OPCODES["system.ping"],
            BINARY_FLAG_REQUIRES_ACK,
            b"",
        )
    return None


def build_binary_command_frame(command):
    binary_payload = build_binary_payload(command)
    if binary_payload is None:
        return None
    target_id, opcode, flags, payload = binary_payload
    body = bytearray()
    body.append(PROTOCOL_VERSION)
    body.extend(seq_u16(command).to_bytes(2, "little", signed=False))
    body.append(target_id & 0xFF)
    body.append(opcode & 0xFF)
    body.append(flags & 0xFF)
    body.extend(payload)
    body.extend(crc16_ccitt_false(body).to_bytes(2, "little", signed=False))
    return b"\x00" + cobs_encode(bytes(body)) + b"\x00"


def serial_json_command(command):
    if not isinstance(command, dict) or command.get("type") != "can_servo.group_move":
        return command
    targets = command.get("targets")
    if not isinstance(targets, list) or not targets:
        raise ValueError("can_servo.group_move requires at least one target")
    if len(targets) > CAN_SERVO_GROUP_MAX_TARGETS:
        raise ValueError("can_servo.group_move supports at most %s targets" % CAN_SERVO_GROUP_MAX_TARGETS)
    flat = {
        "type": "can_servo.group_move",
        "seq": command.get("seq"),
        "count": len(targets),
        "speed": clamp_int(command.get("speed", 0), 0, 0xFFFF),
    }
    for key in ("priority", "commandClass", "policy"):
        if key in command:
            flat[key] = command[key]
    for index, target in enumerate(targets):
        if not isinstance(target, dict):
            raise ValueError("can_servo.group_move targets must be objects")
        flat["id%s" % index] = clamp_int(target.get("id"), 0, 253)
        flat["position%s" % index] = clamp_int(target.get("position"), 0, 0x7FFF)
    return flat


def configure_serial(fd):
    attrs = termios.tcgetattr(fd)
    baud = BAUD_FLAGS.get(BAUD_RATE, termios.B115200)
    attrs[0] = 0
    attrs[1] = 0
    attrs[2] = termios.CLOCAL | termios.CREAD | termios.CS8
    attrs[3] = 0
    attrs[4] = baud
    attrs[5] = baud
    attrs[6][termios.VMIN] = 0
    attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    termios.tcflush(fd, termios.TCIOFLUSH)


def open_serial():
    fd = os.open(SERIAL_PORT, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    configure_serial(fd)
    return fd


def exception_detail(exc):
    detail = {"type": exc.__class__.__name__, "message": str(exc)}
    errno = getattr(exc, "errno", None)
    if errno is not None:
        detail["errno"] = errno
    strerror = getattr(exc, "strerror", None)
    if strerror:
        detail["strerror"] = strerror
    filename = getattr(exc, "filename", None)
    if filename:
        detail["filename"] = filename
    return detail


def serial_device_snapshot():
    snapshot = {
        "path": SERIAL_PORT,
        "exists": os.path.exists(SERIAL_PORT),
        "realpath": os.path.realpath(SERIAL_PORT),
    }
    try:
        stat_result = os.stat(SERIAL_PORT)
        snapshot["modeOct"] = oct(stat_result.st_mode & 0o7777)
        snapshot["uid"] = stat_result.st_uid
        snapshot["gid"] = stat_result.st_gid
        snapshot["rdev"] = stat_result.st_rdev
    except OSError as exc:
        snapshot["statError"] = exception_detail(exc)
    return snapshot


class SerialWorker:
    def __init__(self):
        self.queue = deque()
        self.lock = threading.Lock()
        self.condition = threading.Condition(self.lock)
        self.serial_lock = threading.Lock()
        self.fd = None
        self.buffer = b""
        self.started_at = time.time()
        self.last_rx_at = None
        self.last_error = None
        self.request_count = 0
        self.failure_count = 0
        self.reconnect_count = 0
        self.last_reconnect_at = None
        self.consecutive_open_failures = 0
        self.last_close_reason = None
        self.last_exception = None
        self.last_serial_event = None
        self.serial_events = deque(maxlen=max(10, SERIAL_EVENT_LIMIT))
        self.in_flight = False
        self.in_flight_request_id = None
        self.active_command = None
        self.pending_motion_job = None
        self.latest_motion_seq = None
        self.dropped_motion_count = 0
        self.can_servo_ready = True
        self.mecanum_ready = True
        self.serial_protocol_mode = SERIAL_PROTOCOL_MODE
        self.serial_protocol_active = "binary" if SERIAL_PROTOCOL_MODE == "binary" else "json"
        self.binary_protocol_ready = SERIAL_PROTOCOL_MODE == "binary"
        self.protocol_probe_done = SERIAL_PROTOCOL_MODE != "auto"
        self.bytes_in = 0
        self.bytes_out = 0
        self.frames_in = 0
        self.frames_out = 0
        self.crc_error = 0
        self.cobs_error = 0
        self.drop_count = 0
        self.last_ack_ms = None
        self.last_frame_ms = None
        self.binary_fallback_count = 0
        self.thread = threading.Thread(target=self._run, name="a-board-serial-worker", daemon=True)
        self.reconnect_thread = threading.Thread(target=self._reconnect_loop, name="a-board-serial-reconnect", daemon=True)

    def start(self):
        try:
            self._ensure_serial()
        except Exception as exc:
            self._record_error("startup open failed: %s" % exc)
        self.thread.start()
        self.reconnect_thread.start()

    def submit(self, command, timeout_ms):
        if not isinstance(command, dict):
            raise ValueError("command must be an object")
        seq = command.get("seq")
        if not isinstance(seq, int):
            raise ValueError("command.seq must be an integer")
        timeout_ms = max(10, int(timeout_ms))
        response_queue = queue.Queue(maxsize=1)
        with self.lock:
            self.request_count += 1
            request_id = self.request_count
        job = {
            "id": request_id,
            "command": command,
            "timeout_ms": timeout_ms,
            "response_queue": response_queue,
        }
        self._enqueue_job(job)
        print("a-board request %s queued type=%s seq=%s depth=%s" % (
            request_id,
            command.get("type"),
            seq,
            self._queue_depth(),
        ), flush=True)
        try:
            return response_queue.get(timeout=timeout_ms / 1000.0 + REQUEST_WAIT_MARGIN_SEC)
        except queue.Empty:
            self._record_error("request %s timed out waiting for serial worker" % request_id)
            self._record_serial_event("worker_timeout", "request timed out waiting for serial worker", requestId=request_id, timeoutMs=timeout_ms, commandType=command.get("type"))
            return {
                "ok": False,
                "busy": False,
                "accepted": False,
                "messages": [],
                "serialPort": SERIAL_PORT,
                "baudRate": BAUD_RATE,
                "error": "serial worker timed out",
            }

    def _is_latest_wins_command(self, command):
        return command_policy(command) == "latest"

    def _is_stop_command(self, command):
        return command_policy(command) == "stop"

    def _is_low_priority_command(self, command):
        return isinstance(command, dict) and (command_class(command) == "telemetry" or command_priority(command) <= COMMAND_CLASS_PRIORITIES["telemetry"])

    def _queue_depth_locked(self):
        return len(self.queue) + (1 if self.pending_motion_job is not None else 0)

    def _queue_depth(self):
        with self.lock:
            return self._queue_depth_locked()

    def _protocol_stats_locked(self):
        return {
            "serialProtocolMode": self.serial_protocol_mode,
            "serialProtocolActive": self.serial_protocol_active,
            "binaryProtocolReady": self.binary_protocol_ready,
            "bytesIn": self.bytes_in,
            "bytesOut": self.bytes_out,
            "framesIn": self.frames_in,
            "framesOut": self.frames_out,
            "crcError": self.crc_error,
            "cobsError": self.cobs_error,
            "dropCount": self.drop_count,
            "lastAckMs": self.last_ack_ms,
            "lastFrameMs": self.last_frame_ms,
            "binaryFallbackCount": self.binary_fallback_count,
        }

    def _protocol_stats(self):
        with self.lock:
            return self._protocol_stats_locked()

    def _response_metadata(self):
        metadata = {
            "serialPort": SERIAL_PORT,
            "baudRate": BAUD_RATE,
            "queueDepth": self._queue_depth(),
            "inFlight": self.in_flight,
        }
        metadata.update(self._protocol_stats())
        return metadata

    def _write_serial(self, fd, payload):
        written = os.write(fd, payload)
        now_ms = round(time.time() * 1000)
        with self.lock:
            self.bytes_out += written
            self.frames_out += 1
            self.last_frame_ms = now_ms
        return written

    def _record_inbound_bytes(self, count):
        with self.lock:
            self.bytes_in += count

    def _record_inbound_frame(self, message=None):
        now_ms = round(time.time() * 1000)
        with self.lock:
            self.frames_in += 1
            self.last_frame_ms = now_ms
            if isinstance(message, dict):
                if message.get("type") in ("ack", "protocol.feedback") or message.get("ok") is True:
                    self.last_ack_ms = now_ms
                if isinstance(message.get("crcError"), int):
                    self.crc_error = message.get("crcError")
                if isinstance(message.get("cobsError"), int):
                    self.cobs_error = message.get("cobsError")
                if isinstance(message.get("dropCount"), int):
                    self.drop_count = message.get("dropCount")

    def _dropped_response(self, job, reason):
        command = job.get("command", {})
        body = {
            "ok": False,
            "busy": True,
            "accepted": False,
            "dropped": True,
            "messages": [{
                "type": "scheduler.feedback",
                "seq": command.get("seq", 0),
                "command": command.get("type"),
                "priority": command_priority(command),
                "commandClass": command_class(command),
                "policy": command_policy(command),
                "accepted": False,
                "motionPending": self.pending_motion_job is not None,
                "latestMotionSeq": self.latest_motion_seq,
                "droppedMotionCount": self.dropped_motion_count,
                "activeCommand": self.active_command,
                "message": reason,
            }],
        }
        body.update({
            "serialPort": SERIAL_PORT,
            "baudRate": BAUD_RATE,
            "queueDepth": self._queue_depth_locked(),
            "inFlight": self.in_flight,
        })
        body.update(self._protocol_stats_locked())
        return body

    def _drop_pending_motion_locked(self, reason):
        if self.pending_motion_job is None:
            return
        dropped_job = self.pending_motion_job
        self.pending_motion_job = None
        self.dropped_motion_count += 1
        try:
            dropped_job["response_queue"].put_nowait(self._dropped_response(dropped_job, reason))
        except queue.Full:
            pass

    def _low_priority_busy_response_locked(self, job, reason):
        command = job.get("command", {})
        body = {
            "ok": False,
            "busy": True,
            "accepted": False,
            "telemetrySkipped": True,
            "messages": [{
                "type": "scheduler.feedback",
                "seq": command.get("seq", 0),
                "command": command.get("type"),
                "priority": command_priority(command),
                "commandClass": command_class(command),
                "policy": command_policy(command),
                "accepted": False,
                "motionPending": self.pending_motion_job is not None,
                "latestMotionSeq": self.latest_motion_seq,
                "droppedMotionCount": self.dropped_motion_count,
                "activeCommand": self.active_command,
                "message": reason,
            }],
        }
        body.update({
            "serialPort": SERIAL_PORT,
            "baudRate": BAUD_RATE,
            "queueDepth": self._queue_depth_locked(),
            "inFlight": self.in_flight,
        })
        body.update(self._protocol_stats_locked())
        return body

    def _drop_queued_low_priority_locked(self, reason):
        if not self.queue:
            return
        kept = deque()
        while self.queue:
            queued_job = self.queue.popleft()
            if self._is_low_priority_command(queued_job.get("command")):
                try:
                    queued_job["response_queue"].put_nowait(self._low_priority_busy_response_locked(queued_job, reason))
                except queue.Full:
                    pass
            else:
                kept.append(queued_job)
        self.queue = kept

    def _insert_job_by_priority_locked(self, job):
        priority = command_priority(job.get("command"))
        if not self.queue:
            self.queue.append(job)
            return
        for index, queued_job in enumerate(self.queue):
            if priority > command_priority(queued_job.get("command")):
                self.queue.insert(index, job)
                return
        self.queue.append(job)

    def _enqueue_job(self, job):
        command = job["command"]
        with self.condition:
            if self._is_low_priority_command(command):
                if self.in_flight or self.queue or self.pending_motion_job is not None:
                    try:
                        job["response_queue"].put_nowait(self._low_priority_busy_response_locked(job, "skipped because control path is busy"))
                    except queue.Full:
                        pass
                    return
                self._insert_job_by_priority_locked(job)
            elif self._is_stop_command(command):
                self._drop_queued_low_priority_locked("preempted by stop command")
                self._drop_pending_motion_locked("cleared by stop command")
                self.queue.appendleft(job)
            elif self._is_latest_wins_command(command):
                self._drop_queued_low_priority_locked("preempted by motion command")
                if self.in_flight or self.queue or self.pending_motion_job is not None:
                    if self.pending_motion_job is not None:
                        pending_command = self.pending_motion_job.get("command", {})
                        same_class = command_class(command) == command_class(pending_command)
                        if not same_class and command_priority(command) < command_priority(pending_command):
                            try:
                                job["response_queue"].put_nowait(self._low_priority_busy_response_locked(job, "kept higher priority pending motion target"))
                            except queue.Full:
                                pass
                            return
                    self._drop_pending_motion_locked("replaced by newer or higher priority motion target")
                    self.pending_motion_job = job
                    self.latest_motion_seq = command.get("seq")
                else:
                    self._insert_job_by_priority_locked(job)
                    self.latest_motion_seq = command.get("seq")
            else:
                self._drop_queued_low_priority_locked("preempted by control command")
                self._insert_job_by_priority_locked(job)
            self.condition.notify()

    def _next_job(self):
        with self.condition:
            while not self.queue and self.pending_motion_job is None:
                self.condition.wait()
            if self.queue and self.pending_motion_job is not None:
                if command_priority(self.queue[0].get("command")) >= command_priority(self.pending_motion_job.get("command")):
                    return self.queue.popleft()
                job = self.pending_motion_job
                self.pending_motion_job = None
                return job
            if self.queue:
                return self.queue.popleft()
            job = self.pending_motion_job
            self.pending_motion_job = None
            return job

    def should_reject_busy(self, command):
        if not self._is_low_priority_command(command):
            return False
        with self.lock:
            return self.in_flight or self._queue_depth_locked() > 0

    def busy_response(self):
        with self.lock:
            queue_depth = self._queue_depth_locked()
            in_flight = self.in_flight
        body = {
            "ok": False,
            "busy": True,
            "accepted": False,
            "messages": [],
            "serialPort": SERIAL_PORT,
            "baudRate": BAUD_RATE,
            "queueDepth": queue_depth,
            "inFlight": in_flight,
        }
        body.update(self._protocol_stats())
        return body

    def stats(self):
        with self.lock:
            queue_depth = self._queue_depth_locked()
            body = {
                "serialOpen": self.fd is not None,
                "queueDepth": queue_depth,
                "inFlight": self.in_flight,
                "busy": self.in_flight or queue_depth > 0,
                "motionPending": self.pending_motion_job is not None,
                "latestMotionSeq": self.latest_motion_seq,
                "droppedMotionCount": self.dropped_motion_count,
                "activeCommand": self.active_command,
                "canServoReady": self.can_servo_ready,
                "mecanumReady": self.mecanum_ready,
                "lastRxAt": round(self.last_rx_at, 3) if self.last_rx_at is not None else None,
                "lastError": self.last_error,
                "requestCount": self.request_count,
                "failureCount": self.failure_count,
                "reconnectCount": self.reconnect_count,
                "lastReconnectAt": round(self.last_reconnect_at, 3) if self.last_reconnect_at is not None else None,
                "reconnectIntervalSec": RECONNECT_INTERVAL_SEC,
                "deviceExists": os.path.exists(SERIAL_PORT),
                "lastSerialEvent": self.last_serial_event,
                "lastCloseReason": self.last_close_reason,
                "lastException": self.last_exception,
                "consecutiveOpenFailures": self.consecutive_open_failures,
                "diagnosticsPath": "/diagnostics",
                "uptimeSec": round(time.time() - self.started_at, 1),
            }
            body.update(self._protocol_stats_locked())
            return body

    def diagnostics(self):
        with self.lock:
            body = {
                "serialOpen": self.fd is not None,
                "serialPort": SERIAL_PORT,
                "baudRate": BAUD_RATE,
                "device": serial_device_snapshot(),
                "queueDepth": self._queue_depth_locked(),
                "inFlight": self.in_flight,
                "inFlightRequestId": self.in_flight_request_id,
                "motionPending": self.pending_motion_job is not None,
                "latestMotionSeq": self.latest_motion_seq,
                "droppedMotionCount": self.dropped_motion_count,
                "activeCommand": self.active_command,
                "canServoReady": self.can_servo_ready,
                "mecanumReady": self.mecanum_ready,
                "requestCount": self.request_count,
                "failureCount": self.failure_count,
                "reconnectCount": self.reconnect_count,
                "lastReconnectAt": round(self.last_reconnect_at, 3) if self.last_reconnect_at is not None else None,
                "lastError": self.last_error,
                "lastSerialEvent": self.last_serial_event,
                "lastCloseReason": self.last_close_reason,
                "lastException": self.last_exception,
                "consecutiveOpenFailures": self.consecutive_open_failures,
                "events": list(self.serial_events),
                "uptimeSec": round(time.time() - self.started_at, 1),
            }
            body.update(self._protocol_stats_locked())
            return body

    def _record_serial_event(self, kind, message=None, **extra):
        event = {
            "at": round(time.time(), 3),
            "kind": kind,
            "serialOpen": self.fd is not None,
            "deviceExists": os.path.exists(SERIAL_PORT),
            "queueDepth": self._queue_depth(),
            "inFlight": self.in_flight,
        }
        if message:
            event["message"] = message
        event.update(extra)
        with self.lock:
            self.last_serial_event = event
            self.serial_events.append(event)
        print("a-board serial event: %s" % json.dumps(event, separators=(",", ":")), flush=True)

    def _record_error(self, message):
        with self.lock:
            self.last_error = message
            self.failure_count += 1
        print("a-board serial error: %s" % message, flush=True)

    def _record_rx(self):
        with self.lock:
            self.last_rx_at = time.time()
            self.last_error = None

    def _record_reconnect(self):
        with self.lock:
            self.reconnect_count += 1
            self.last_reconnect_at = time.time()
            self.last_error = None
            self.consecutive_open_failures = 0
        print("a-board serial reconnected %s @ %s total=%s" % (
            SERIAL_PORT,
            BAUD_RATE,
            self.reconnect_count,
        ), flush=True)
        self._record_serial_event("reconnected", "serial device reopened by background reconnect loop", device=serial_device_snapshot())

    def _ensure_serial(self):
        with self.serial_lock:
            if self.fd is not None:
                return self.fd
            self._record_serial_event("open_attempt", "opening serial device", device=serial_device_snapshot())
            try:
                self.fd = open_serial()
            except Exception as exc:
                detail = exception_detail(exc)
                with self.lock:
                    self.consecutive_open_failures += 1
                    self.last_exception = detail
                self._record_serial_event("open_failed", "failed to open serial device", exception=detail, device=serial_device_snapshot())
                raise
            with self.lock:
                self.consecutive_open_failures = 0
                self.last_exception = None
                self.last_close_reason = None
            self.buffer = b""
            if self.serial_protocol_mode == "auto":
                self.protocol_probe_done = False
                self.binary_protocol_ready = False
                self.serial_protocol_active = "json"
            print("a-board serial opened %s @ %s" % (SERIAL_PORT, BAUD_RATE), flush=True)
            self._record_serial_event("opened", "serial device opened", device=serial_device_snapshot())
            return self.fd

    def _close_serial(self, reason="unspecified", exc=None):
        with self.serial_lock:
            if self.fd is None:
                return
            try:
                os.close(self.fd)
            except OSError:
                pass
            self.fd = None
            self.buffer = b""
        detail = exception_detail(exc) if exc is not None else None
        with self.lock:
            self.last_close_reason = reason
            if detail is not None:
                self.last_exception = detail
        event = {"reason": reason, "device": serial_device_snapshot()}
        if detail is not None:
            event["exception"] = detail
        self._record_serial_event("closed", "serial fd closed", **event)

    def _reconnect_loop(self):
        while True:
            time.sleep(max(0.2, RECONNECT_INTERVAL_SEC))
            if self.fd is not None:
                continue
            if not os.path.exists(SERIAL_PORT):
                self._record_serial_event("device_missing", "serial device path does not exist during reconnect check", device=serial_device_snapshot())
                continue
            try:
                self._ensure_serial()
                self._record_reconnect()
            except Exception as exc:
                self._record_error("auto reconnect failed: %s" % exc)

    def _run(self):
        while True:
            job = self._next_job()
            request_id = job["id"]
            command = job["command"]
            response_queue = job["response_queue"]
            with self.lock:
                self.in_flight = True
                self.in_flight_request_id = request_id
                self.active_command = command.get("type")
            try:
                messages, matched = self._send_command(command, job["timeout_ms"])
                response = {
                    "ok": matched,
                    "busy": False,
                    "accepted": True,
                    "messages": messages,
                }
                response.update(self._response_metadata())
                response_queue.put(response)
                if not matched:
                    self._record_error("request %s seq=%s timed out or did not match response" % (
                        request_id,
                        command.get("seq"),
                    ))
                    self._record_serial_event("no_matching_response", "request did not receive a terminal response for the same seq", requestId=request_id, seq=command.get("seq"), timeoutMs=job["timeout_ms"], commandType=command.get("type"), messagesSeen=len(messages))
            except ValueError as exc:
                self._record_error("request %s rejected: %s" % (request_id, exc))
                response = {
                    "ok": False,
                    "busy": False,
                    "accepted": False,
                    "messages": [{
                        "type": "error",
                        "seq": command.get("seq", 0),
                        "command": command.get("type"),
                        "code": "invalid_argument",
                        "message": str(exc),
                    }],
                    "error": str(exc),
                }
                response.update(self._response_metadata())
                response_queue.put(response)
            except Exception as exc:
                self._record_error("request %s failed: %s" % (request_id, exc))
                self._record_serial_event("request_failed", "serial request raised an exception", requestId=request_id, seq=command.get("seq"), commandType=command.get("type"), exception=exception_detail(exc))
                self._close_serial("request_failed", exc)
                response = {
                    "ok": False,
                    "busy": False,
                    "accepted": True,
                    "messages": [],
                    "error": str(exc),
                }
                response.update(self._response_metadata())
                response_queue.put(response)
            finally:
                with self.lock:
                    self.in_flight = False
                    self.in_flight_request_id = None
                    self.active_command = None

    def _send_command(self, command, timeout_ms):
        fd = self._ensure_serial()
        if self._should_use_binary(command):
            frame = build_binary_command_frame(command)
            if frame is not None:
                self._write_serial(fd, frame)
                messages, matched = self._read_lines_until(command, timeout_ms)
                if matched:
                    return messages, True
                self._record_binary_fallback(command, messages)
                fallback_messages, fallback_matched = self._send_json_command(fd, command, timeout_ms)
                return messages + fallback_messages, fallback_matched
        return self._send_json_command(fd, command, timeout_ms)

    def _send_json_command(self, fd, command, timeout_ms):
        payload = (json.dumps(serial_json_command(command), separators=(",", ":")) + "\n").encode("utf-8")
        self._write_serial(fd, payload)
        return self._read_lines_until(command, timeout_ms)

    def _should_use_binary(self, command):
        if self.serial_protocol_mode == "json":
            return False
        if self.serial_protocol_mode == "binary":
            return True
        fd = self._ensure_serial()
        if not self.protocol_probe_done:
            self._probe_binary_protocol(fd)
        return self.binary_protocol_ready

    def _probe_binary_protocol(self, fd):
        probe = {"type": "system.protocol", "seq": 0, "version": PROTOCOL_VERSION}
        try:
            self._send_json_command(fd, probe, PROTOCOL_PROBE_TIMEOUT_MS)
        except Exception as exc:
            with self.lock:
                self.protocol_probe_done = True
                self.binary_protocol_ready = False
                self.serial_protocol_active = "json"
            self._record_serial_event("binary_protocol_probe_failed", "binary protocol probe failed; using JSON", exception=exception_detail(exc))
            return False
        ready = False
        with self.lock:
            self.protocol_probe_done = True
            ready = self.binary_protocol_ready
            self.serial_protocol_active = "binary" if ready else "json"
        self._record_serial_event(
            "binary_protocol_probe",
            "binary protocol ready" if ready else "binary protocol unavailable; using JSON",
            binaryProtocolReady=ready,
        )
        return ready

    def _record_binary_fallback(self, command, messages):
        with self.lock:
            self.binary_fallback_count += 1
            self.binary_protocol_ready = False
            self.serial_protocol_active = "json"
        self._record_serial_event(
            "binary_fallback",
            "binary command did not receive a matching response; retried with JSON",
            seq=command.get("seq"),
            commandType=command.get("type"),
            messagesSeen=len(messages),
        )

    def _expected_terminal_count(self, command):
        if command.get("type") in ("motor.stop", "motor.read") and command.get("all") is True:
            return MOTOR_CHANNEL_COUNT
        return 1

    def _read_lines_until(self, command, timeout_ms):
        seq = command.get("seq")
        command_type = command.get("type")
        deadline = time.monotonic() + timeout_ms / 1000.0
        settle_deadline = None
        messages = []
        matched = False
        matched_terminal_count = 0
        expected_terminal_count = self._expected_terminal_count(command)
        while True:
            active_deadline = settle_deadline if settle_deadline is not None else deadline
            if time.monotonic() >= active_deadline:
                return messages, matched
            remaining = max(0.0, active_deadline - time.monotonic())
            readable, _, _ = select.select([self.fd], [], [], min(0.05, remaining))
            if not readable:
                continue
            try:
                chunk = os.read(self.fd, 4096)
            except BlockingIOError:
                continue
            if not chunk:
                continue
            self._record_inbound_bytes(len(chunk))
            self._record_rx()
            self.buffer += chunk
            while b"\n" in self.buffer:
                line, self.buffer = self.buffer.split(b"\n", 1)
                text = line.decode("utf-8", errors="replace").strip()
                if not text:
                    continue
                try:
                    message = json.loads(text)
                except json.JSONDecodeError:
                    message = {"type": "log", "message": text}
                messages.append(message)
                self._record_inbound_frame(message)
                if isinstance(message, dict) and message.get("type") == "protocol.feedback":
                    with self.lock:
                        self.binary_protocol_ready = message.get("binaryProtocolReady") is True
                        if self.serial_protocol_mode != "json":
                            self.serial_protocol_active = "binary" if self.binary_protocol_ready else "json"
                if not isinstance(message, dict) or message.get("seq") != seq:
                    continue
                message_type = message.get("type")
                if message_type == "ack" and command_type in ACK_ONLY_COMMANDS:
                    return messages, True
                if message_type == "protocol.feedback" and command_type == "system.protocol":
                    return messages, True
                if message_type == "error":
                    return messages, True
                if command_type == "can.send" and message_type in ("can.feedback", "can.frame"):
                    matched = True
                    settle_deadline = min(deadline, time.monotonic() + 0.12)
                    continue
                if message_type in TERMINAL_TYPES:
                    matched = True
                    matched_terminal_count += 1
                    if matched_terminal_count >= expected_terminal_count:
                        return messages, True


worker = SerialWorker()


def send_json(handler, status, body):
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "content-type")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.send_header("Access-Control-Allow-Private-Network", "true")
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_json(self, 200, {"ok": True})

    def do_GET(self):
        if self.path == "/diagnostics":
            body = {"ok": True, "service": SERVICE, "version": VERSION}
            body.update(worker.diagnostics())
            send_json(self, 200, body)
            return
        if self.path != "/health":
            send_json(self, 404, {"ok": False, "error": "not found"})
            return
        exists = os.path.exists(SERIAL_PORT)
        body = {"ok": exists, "service": SERVICE, "version": VERSION, "serialPort": SERIAL_PORT, "baudRate": BAUD_RATE}
        body.update(worker.stats())
        send_json(self, 200, body)

    def do_POST(self):
        if self.path != "/command":
            send_json(self, 404, {"ok": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            command = translate_command(body.get("command", body))
            timeout_ms = int(body.get("timeoutMs", DEFAULT_TIMEOUT_MS))
            if worker.should_reject_busy(command):
                send_json(self, 200, worker.busy_response())
                return
            result = worker.submit(command, timeout_ms)
            send_json(self, 200, result)
        except Exception as exc:
            send_json(self, 500, {"ok": False, "error": str(exc), "messages": []})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    worker.start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("A board serial bridge listening on %s:%s -> %s @ %s" % (HOST, PORT, SERIAL_PORT, BAUD_RATE), flush=True)
    server.serve_forever()
