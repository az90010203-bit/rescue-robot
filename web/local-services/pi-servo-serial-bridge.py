#!/usr/bin/env python3
from collections import deque
import json
import math
import os
import queue
import select
import sys
import termios
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERVICE = "pi-servo-serial-bridge"
VERSION = "0.2.0"
SERIAL_PORT = os.environ.get("PI_SERVO_SERIAL_PORT", "/dev/serial0")
BAUD_RATE = int(os.environ.get("PI_SERVO_BAUD", "115200"))
SERIAL_PROTOCOL_MODE = os.environ.get("PI_SERVO_SERIAL_PROTOCOL", "auto").strip().lower() or "auto"
if SERIAL_PROTOCOL_MODE not in ("auto", "binary", "json"):
    SERIAL_PROTOCOL_MODE = "auto"
HOST = os.environ.get("PI_SERVO_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("PI_SERVO_BRIDGE_PORT", "17354"))
DEFAULT_WAIT_MS = int(os.environ.get("PI_SERVO_WAIT_MS", "120"))
REQUEST_WAIT_MARGIN_SEC = float(os.environ.get("PI_SERVO_REQUEST_WAIT_MARGIN_SEC", "2.0"))
STALE_RX_DRAIN_MS = int(os.environ.get("PI_SERVO_STALE_RX_DRAIN_MS", "5"))
RECONNECT_INTERVAL_SEC = float(os.environ.get("PI_SERVO_RECONNECT_INTERVAL_SEC", "1.0"))
SERIAL_EVENT_LIMIT = int(os.environ.get("PI_SERVO_SERIAL_EVENT_LIMIT", "80"))
LIVE_POLICY_LATEST = "latest"
DEFAULT_LIVE_MIN_INTERVAL_MS = int(os.environ.get("PI_SERVO_LIVE_MIN_INTERVAL_MS", "40"))
PROTOCOL_VERSION = 1
BINARY_FLAG_LATEST_WINS = 0x01
BINARY_FLAG_REQUIRES_ACK = 0x02
BINARY_TARGET_FEETECH_SERVO = 0x05
BINARY_TARGET_FEETECH_GROUP = 0x06
BINARY_OPCODES = {
    "servo.ping": 0x40,
    "servo.read": 0x41,
    "servo.torque": 0x42,
    "servo.mode": 0x43,
    "servo.move": 0x44,
    "servo.speed": 0x45,
    "servo.set_id": 0x46,
    "servo.group_move": 0x47,
}
BAUD_FLAGS = {
    115200: termios.B115200,
    1000000: getattr(termios, "B1000000", termios.B115200),
}
TERMINAL_TYPES = ("ack", "error", "servo.feedback", "protocol.feedback")


def configure_serial(fd):
    attrs = termios.tcgetattr(fd)
    baud = BAUD_FLAGS.get(BAUD_RATE, getattr(termios, "B1000000", termios.B115200))
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


def clamp_int(value, default, minimum, maximum):
    try:
        parsed = int(round(float(value)))
    except (TypeError, ValueError, OverflowError):
        parsed = default
    return max(minimum, min(maximum, parsed))


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


def u8(value, default=0):
    return bytes([clamp_int(value, default, 0, 255) & 0xFF])


def u16_le(value, default=0):
    return clamp_int(value, default, 0, 0xFFFF).to_bytes(2, "little", signed=False)


def i16_le(value, default=0):
    return clamp_int(value, default, -32768, 32767).to_bytes(2, "little", signed=True)


def seq_u16(command):
    return clamp_int(command.get("seq"), 0, 0, 0xFFFF)


def angle_to_raw(value):
    try:
        angle = float(value)
    except (TypeError, ValueError, OverflowError):
        angle = 0.0
    if not math.isfinite(angle):
        angle = 0.0
    return clamp_int((angle / 360.0) * 4095.0, 0, 0, 4095)


def target_position_raw(target):
    if isinstance(target, dict) and "positionRaw" in target:
        return clamp_int(target.get("positionRaw"), 0, 0, 4095)
    return angle_to_raw(target.get("angleDeg") if isinstance(target, dict) else None)


def command_target_id(command):
    if "id" in command:
        return command.get("id")
    targets = command.get("targets")
    if isinstance(targets, list) and targets:
        first = targets[0]
        if isinstance(first, dict):
            return first.get("id")
    return 0


def first_target(command):
    targets = command.get("targets")
    if isinstance(targets, list) and len(targets) == 1 and isinstance(targets[0], dict):
        return targets[0]
    if not isinstance(targets, list):
        return command
    return None


def group_target_payload(command):
    targets = command.get("targets")
    if not isinstance(targets, list) or not targets:
        return None
    if len(targets) > 12:
        raise ValueError("servo.group_move supports at most 12 targets")
    first_speed = clamp_int(targets[0].get("speedRaw") if isinstance(targets[0], dict) else 0, 0, 0, 4095)
    first_acc = clamp_int(targets[0].get("acc") if isinstance(targets[0], dict) else 0, 0, 0, 254)
    payload = bytearray()
    payload.append(len(targets) & 0xFF)
    for target in targets:
        if not isinstance(target, dict):
            return None
        speed = clamp_int(target.get("speedRaw"), first_speed, 0, 4095)
        acc = clamp_int(target.get("acc"), first_acc, 0, 254)
        if speed != first_speed or acc != first_acc:
            return None
        payload.extend(u8(target.get("id")))
        payload.extend(u16_le(target_position_raw(target)))
    payload.extend(u16_le(first_speed))
    payload.extend(u8(first_acc))
    return bytes(payload)


def normalize_command(value):
    if not isinstance(value, dict):
        raise ValueError("command must be an object")
    if isinstance(value.get("command"), dict):
        value = value["command"]
    command = dict(value)
    if command.get("type") == "servo.read_feedback":
        command["type"] = "servo.read"
    if command.get("type") == "servo.set_position":
        command = {
            "type": "servo.move",
            "seq": command.get("seq"),
            "targets": [{
                "id": command.get("id"),
                "angleDeg": command.get("angleDeg"),
                "positionRaw": command.get("positionRaw"),
                "speedRaw": command.get("speedRaw"),
                "acc": command.get("acc"),
            }],
        }
    if command.get("type") == "servo.set_speed":
        command = {
            "type": "servo.speed",
            "seq": command.get("seq"),
            "setupWheelMode": command.get("setupWheelMode", True),
            "targets": [{
                "id": command.get("id"),
                "speedRaw": command.get("speedRaw"),
                "acc": command.get("acc"),
            }],
        }
    if not isinstance(command.get("seq"), int):
        command["seq"] = 0
    return command


def build_binary_payload(command, latest=False):
    command_type = command.get("type")
    flags = BINARY_FLAG_REQUIRES_ACK | (BINARY_FLAG_LATEST_WINS if latest else 0)
    if command_type == "servo.ping":
        return BINARY_TARGET_FEETECH_SERVO, BINARY_OPCODES[command_type], flags, u8(command.get("id"))
    if command_type == "servo.read":
        return BINARY_TARGET_FEETECH_SERVO, BINARY_OPCODES[command_type], flags, u8(command.get("id"))
    if command_type == "servo.torque":
        return (
            BINARY_TARGET_FEETECH_SERVO,
            BINARY_OPCODES[command_type],
            flags,
            u8(command.get("id")) + u8(1 if command.get("enabled") else 0),
        )
    if command_type == "servo.mode":
        mode = str(command.get("mode", "servo")).strip().lower()
        return (
            BINARY_TARGET_FEETECH_SERVO,
            BINARY_OPCODES[command_type],
            flags,
            u8(command.get("id")) + u8(1 if mode == "wheel" else 0),
        )
    if command_type == "servo.move":
        target = first_target(command)
        if target is None:
            payload = group_target_payload(command)
            if payload is None:
                return None
            return BINARY_TARGET_FEETECH_GROUP, BINARY_OPCODES["servo.group_move"], flags, payload
        return (
            BINARY_TARGET_FEETECH_SERVO,
            BINARY_OPCODES[command_type],
            flags,
            b"".join([
                u8(target.get("id")),
                u16_le(target_position_raw(target)),
                u16_le(target.get("speedRaw"), 0),
                u8(target.get("acc"), 0),
            ]),
        )
    if command_type == "servo.speed":
        target = first_target(command)
        if target is None:
            return None
        return (
            BINARY_TARGET_FEETECH_SERVO,
            BINARY_OPCODES[command_type],
            flags,
            b"".join([
                u8(target.get("id")),
                i16_le(target.get("speedRaw"), 0),
                u8(target.get("acc"), 50),
                u8(1 if command.get("setupWheelMode", True) else 0),
            ]),
        )
    if command_type == "servo.set_id":
        return (
            BINARY_TARGET_FEETECH_SERVO,
            BINARY_OPCODES[command_type],
            flags,
            u8(command.get("oldId", command_target_id(command))) + u8(command.get("newId")),
        )
    return None


def build_binary_command_frame(command, latest=False):
    binary_payload = build_binary_payload(command, latest=latest)
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


def command_expects_response(command):
    return command.get("type") in ("servo.ping", "servo.read", "servo.torque", "servo.mode", "servo.move", "servo.speed", "servo.set_id", "debug.set", "system.protocol")


def is_terminal_message(message, seq):
    if not isinstance(message, dict):
        return False
    if message.get("type") not in TERMINAL_TYPES:
        return False
    return int(message.get("seq", -999999)) == int(seq)


class SerialWorker:
    def __init__(self):
        self.queue = deque()
        self.lock = threading.Lock()
        self.condition = threading.Condition(self.lock)
        self.serial_lock = threading.Lock()
        self.fd = None
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
        self.dropped_rx_bytes = 0
        self.last_dropped_rx_at = None
        self.live_skipped = 0
        self.live_rate_limited = 0
        self.live_latest_request_by_key = {}
        self.live_last_sent_at_by_key = {}
        self.in_flight = False
        self.in_flight_request_id = None
        self.serial_protocol_mode = SERIAL_PROTOCOL_MODE
        self.serial_protocol_active = "binary" if SERIAL_PROTOCOL_MODE == "binary" else "json"
        self.binary_protocol_ready = SERIAL_PROTOCOL_MODE == "binary"
        self.binary_protocol_probed = SERIAL_PROTOCOL_MODE != "auto"
        self.controller_ready = False
        self.binary_frames_out = 0
        self.json_frames_out = 0
        self.binary_fallback_count = 0
        self.crc_error = 0
        self.cobs_error = 0
        self.drop_count = 0
        self.thread = threading.Thread(target=self._run, name="pi-servo-serial-worker", daemon=True)
        self.reconnect_thread = threading.Thread(target=self._reconnect_loop, name="pi-servo-serial-reconnect", daemon=True)

    def start(self):
        try:
            self._ensure_serial()
        except Exception as exc:
            self._record_error("startup open failed: %s" % exc)
        self.thread.start()
        self.reconnect_thread.start()

    def submit(self, command, wait_ms, policy=None, coalesce_key=None, min_interval_ms=None):
        command = normalize_command(command)
        wait_ms = max(10, int(wait_ms))
        live_policy = LIVE_POLICY_LATEST if policy == LIVE_POLICY_LATEST and coalesce_key else None
        live_key = str(coalesce_key) if live_policy else None
        live_min_interval_ms = clamp_int(min_interval_ms, DEFAULT_LIVE_MIN_INTERVAL_MS, 0, 1000) if live_policy else None
        response_queue = queue.Queue(maxsize=1)
        with self.condition:
            self.request_count += 1
            request_id = self.request_count
            if live_key:
                self.live_latest_request_by_key[live_key] = request_id
            dropped_jobs = self._drop_queued_live_jobs_locked(live_key, request_id) if live_key else []
            job = {
                "id": request_id,
                "command": command,
                "wait_ms": wait_ms,
                "policy": live_policy,
                "coalesce_key": live_key,
                "min_interval_ms": live_min_interval_ms,
                "response_queue": response_queue,
            }
            self.queue.append(job)
            depth = len(self.queue)
            self.condition.notify()
        for dropped_job in dropped_jobs:
            self._complete_stale_live_job(dropped_job, "replaced")
        print("pi-servo command %s queued type=%s depth=%s" % (request_id, command.get("type"), depth), flush=True)
        try:
            return response_queue.get(timeout=wait_ms / 1000.0 + REQUEST_WAIT_MARGIN_SEC)
        except queue.Empty:
            self._record_error("request %s timed out waiting for serial worker" % request_id)
            self._record_serial_event("worker_timeout", "request timed out waiting for serial worker", requestId=request_id, waitMs=wait_ms)
            return {"ok": False, "messages": [], "serialPort": SERIAL_PORT, "baudRate": BAUD_RATE, "error": "serial worker timed out"}

    def _drop_queued_live_jobs_locked(self, live_key, replacement_id):
        if not live_key:
            return []
        kept = deque()
        dropped = []
        while self.queue:
            job = self.queue.popleft()
            if (
                job.get("policy") == LIVE_POLICY_LATEST and
                job.get("coalesce_key") == live_key and
                job.get("id") != replacement_id
            ):
                dropped.append(job)
            else:
                kept.append(job)
        self.queue = kept
        return dropped

    def _complete_stale_live_job(self, job, reason="stale"):
        with self.lock:
            self.live_skipped += 1
        key = job.get("coalesce_key")
        self._record_serial_event("live_stale_skipped", "skipped stale live servo command", requestId=job["id"], coalesceKey=key, reason=reason)
        try:
            job["response_queue"].put_nowait({
                "ok": True,
                "messages": [],
                "responseExpected": False,
                "skipped": True,
                "reason": reason,
                "serialPort": SERIAL_PORT,
                "baudRate": BAUD_RATE,
            })
        except queue.Full:
            pass

    def stats(self):
        with self.lock:
            return {
                "serialOpen": self.fd is not None,
                "queueDepth": len(self.queue),
                "inFlight": self.in_flight,
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
                "droppedRxBytes": self.dropped_rx_bytes,
                "lastDroppedRxAt": round(self.last_dropped_rx_at, 3) if self.last_dropped_rx_at is not None else None,
                "liveSkipped": self.live_skipped,
                "liveRateLimited": self.live_rate_limited,
                "liveLastSentAtByKey": {key: round(value, 3) for key, value in self.live_last_sent_at_by_key.items()},
                "transportMode": "esp32-cobs",
                "serialProtocolMode": self.serial_protocol_mode,
                "serialProtocolActive": self.serial_protocol_active,
                "binaryProtocolReady": self.binary_protocol_ready,
                "controllerReady": self.controller_ready,
                "binaryFramesOut": self.binary_frames_out,
                "jsonFramesOut": self.json_frames_out,
                "binaryFallbackCount": self.binary_fallback_count,
                "crcError": self.crc_error,
                "cobsError": self.cobs_error,
                "dropCount": self.drop_count,
                "uptimeSec": round(time.time() - self.started_at, 1),
            }

    def diagnostics(self):
        body = self.stats()
        body.update({
            "serialPort": SERIAL_PORT,
            "baudRate": BAUD_RATE,
            "device": serial_device_snapshot(),
            "inFlightRequestId": self.in_flight_request_id,
            "events": list(self.serial_events),
        })
        return body

    def _record_serial_event(self, kind, message=None, **extra):
        event = {
            "at": round(time.time(), 3),
            "kind": kind,
            "serialOpen": self.fd is not None,
            "deviceExists": os.path.exists(SERIAL_PORT),
            "queueDepth": len(self.queue),
            "inFlight": self.in_flight,
        }
        if message:
            event["message"] = message
        event.update(extra)
        with self.lock:
            self.last_serial_event = event
            self.serial_events.append(event)
        print("pi-servo serial event: %s" % json.dumps(event, separators=(",", ":")), flush=True)

    def _record_error(self, message):
        with self.lock:
            self.last_error = message
            self.failure_count += 1
        print("pi-servo serial error: %s" % message, flush=True)

    def _record_rx(self):
        with self.lock:
            self.last_rx_at = time.time()
            self.last_error = None

    def _record_dropped_rx(self, count):
        if count <= 0:
            return
        with self.lock:
            self.dropped_rx_bytes += count
            self.last_dropped_rx_at = time.time()
        self._record_serial_event("stale_rx_dropped", "dropped bytes already waiting in the serial input buffer", droppedBytes=count)

    def _live_skip_response(self, job):
        key = job.get("coalesce_key")
        if job.get("policy") != LIVE_POLICY_LATEST or not key:
            return None
        with self.lock:
            if self.live_latest_request_by_key.get(key) == job["id"]:
                return None
            self.live_skipped += 1
        self._record_serial_event("live_stale_skipped", "skipped stale live servo command", requestId=job["id"], coalesceKey=key)
        return {"ok": True, "messages": [], "responseExpected": False, "skipped": True, "reason": "stale", "serialPort": SERIAL_PORT, "baudRate": BAUD_RATE}

    def _live_rate_limit_delay(self, job):
        key = job.get("coalesce_key")
        interval_ms = job.get("min_interval_ms")
        if job.get("policy") != LIVE_POLICY_LATEST or not key or not interval_ms:
            return 0.0
        with self.lock:
            last_sent = self.live_last_sent_at_by_key.get(key)
            if last_sent is None:
                return 0.0
            delay = last_sent + interval_ms / 1000.0 - time.time()
            if delay > 0:
                self.live_rate_limited += 1
                return delay
        return 0.0

    def _record_live_sent(self, job):
        key = job.get("coalesce_key")
        if job.get("policy") == LIVE_POLICY_LATEST and key:
            with self.lock:
                self.live_last_sent_at_by_key[key] = time.time()

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
            print("pi-servo serial opened %s @ %s" % (SERIAL_PORT, BAUD_RATE), flush=True)
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
                with self.lock:
                    self.reconnect_count += 1
                    self.last_reconnect_at = time.time()
                    self.last_error = None
                    self.consecutive_open_failures = 0
                self._record_serial_event("reconnected", "serial device reopened by background reconnect loop", device=serial_device_snapshot())
            except Exception as exc:
                self._record_error("auto reconnect failed: %s" % exc)

    def _next_job(self):
        with self.condition:
            while not self.queue:
                self.condition.wait()
            return self.queue.popleft()

    def _run(self):
        while True:
            job = self._next_job()
            response_queue = job["response_queue"]
            with self.lock:
                self.in_flight = True
                self.in_flight_request_id = job["id"]
            try:
                skipped = self._live_skip_response(job)
                if skipped is not None:
                    response_queue.put(skipped)
                    continue
                delay = self._live_rate_limit_delay(job)
                if delay > 0:
                    self._record_serial_event("live_rate_limited", "delaying live servo command to respect per-key interval", requestId=job["id"], coalesceKey=job.get("coalesce_key"), delayMs=round(delay * 1000, 1))
                    time.sleep(delay)
                    skipped = self._live_skip_response(job)
                    if skipped is not None:
                        response_queue.put(skipped)
                        continue
                response = self._send_command(job["command"], job["wait_ms"], job.get("policy") == LIVE_POLICY_LATEST)
                self._record_live_sent(job)
                response_queue.put(response)
            except Exception as exc:
                self._record_error("request %s failed: %s" % (job["id"], exc))
                self._record_serial_event("request_failed", "serial request raised an exception", requestId=job["id"], exception=exception_detail(exc))
                self._close_serial("request_failed", exc)
                response_queue.put({"ok": False, "messages": [], "serialPort": SERIAL_PORT, "baudRate": BAUD_RATE, "error": str(exc)})
            finally:
                with self.lock:
                    self.in_flight = False
                    self.in_flight_request_id = None

    def _send_command(self, command, wait_ms, latest=False):
        fd = self._ensure_serial()
        self._drain_stale_rx()
        protocol = "json"
        payload = None
        if self._should_use_binary(fd):
            payload = build_binary_command_frame(command, latest=latest)
            if payload is not None:
                protocol = "binary"
        if payload is None:
            payload = (json.dumps(command, separators=(",", ":")) + "\n").encode("utf-8")
        os.write(fd, payload)
        if protocol == "binary":
            self.binary_frames_out += 1
        else:
            self.json_frames_out += 1
        messages, raw_lines = self._read_json_messages(wait_ms, command.get("seq"))
        self._learn_protocol_counters(messages)
        if protocol == "binary" and self._binary_missing_response(command, messages):
            self._record_binary_fallback(command, messages)
            fallback = (json.dumps(command, separators=(",", ":")) + "\n").encode("utf-8")
            os.write(fd, fallback)
            self.json_frames_out += 1
            messages, raw_lines = self._read_json_messages(wait_ms, command.get("seq"))
            self._learn_protocol_counters(messages)
            protocol = "json-fallback"
        terminal = next((message for message in messages if is_terminal_message(message, command.get("seq"))), None)
        ok = terminal is not None and terminal.get("type") != "error"
        return {
            "ok": ok,
            "messages": messages,
            "response": terminal,
            "rawLines": raw_lines,
            "serialPort": SERIAL_PORT,
            "baudRate": BAUD_RATE,
            "protocol": protocol,
            "responseExpected": command_expects_response(command),
        }

    def _should_use_binary(self, fd):
        if self.serial_protocol_mode == "json":
            self.serial_protocol_active = "json"
            return False
        if self.serial_protocol_mode == "binary":
            self.serial_protocol_active = "binary"
            return True
        if not self.binary_protocol_probed:
            self._probe_binary_protocol(fd)
        self.serial_protocol_active = "binary" if self.binary_protocol_ready else "json"
        return self.binary_protocol_ready

    def _probe_binary_protocol(self, fd):
        self.binary_protocol_probed = True
        probe = {"type": "system.protocol", "seq": 0, "version": PROTOCOL_VERSION}
        try:
            self._drain_stale_rx()
            os.write(fd, (json.dumps(probe, separators=(",", ":")) + "\n").encode("utf-8"))
            self.json_frames_out += 1
            messages, _ = self._read_json_messages(320, 0)
            ready = any(message.get("type") == "protocol.feedback" and message.get("binaryProtocolReady") is True for message in messages if isinstance(message, dict))
            self.binary_protocol_ready = ready
            self.controller_ready = ready or bool(messages)
            self._learn_protocol_counters(messages)
            self._record_serial_event("binary_protocol_probe", "binary protocol ready" if ready else "binary protocol unavailable; using JSON", binaryProtocolReady=ready)
        except Exception as exc:
            self.binary_protocol_ready = False
            self._record_serial_event("binary_protocol_probe_failed", "binary protocol probe failed; using JSON", exception=exception_detail(exc))

    def _binary_missing_response(self, command, messages):
        if not command_expects_response(command):
            return False
        return not any(is_terminal_message(message, command.get("seq")) for message in messages)

    def _record_binary_fallback(self, command, messages):
        self.binary_fallback_count += 1
        self.binary_protocol_ready = False
        self.serial_protocol_active = "json"
        self._record_serial_event("binary_fallback", "binary command did not receive a matching response; retried with JSON", command=command.get("type"), messageCount=len(messages))

    def _learn_protocol_counters(self, messages):
        for message in messages:
            if not isinstance(message, dict):
                continue
            if message.get("type") == "protocol.feedback":
                self.controller_ready = True
                if message.get("binaryProtocolReady") is True:
                    self.binary_protocol_ready = True
                for source, attr in (("crcError", "crc_error"), ("cobsError", "cobs_error"), ("dropCount", "drop_count")):
                    if isinstance(message.get(source), int):
                        setattr(self, attr, message[source])

    def _drain_stale_rx(self):
        dropped = self._drain_rx(STALE_RX_DRAIN_MS)
        if dropped:
            self._record_dropped_rx(dropped)

    def _drain_rx(self, max_ms):
        if self.fd is None:
            return 0
        deadline = time.monotonic() + max(0, max_ms) / 1000.0
        dropped = 0
        while True:
            timeout = 0 if dropped == 0 else max(0.0, min(0.002, deadline - time.monotonic()))
            if dropped > 0 and time.monotonic() >= deadline:
                break
            readable, _, _ = select.select([self.fd], [], [], timeout)
            if not readable:
                break
            try:
                chunk = os.read(self.fd, 4096)
            except BlockingIOError:
                continue
            if not chunk:
                break
            dropped += len(chunk)
        return dropped

    def _read_json_messages(self, wait_ms, seq=None):
        deadline = time.monotonic() + max(10, wait_ms) / 1000.0
        buffer = b""
        messages = []
        raw_lines = []
        while time.monotonic() < deadline:
            remaining = max(0.0, deadline - time.monotonic())
            readable, _, _ = select.select([self.fd], [], [], min(0.02, remaining))
            if not readable:
                continue
            try:
                chunk = os.read(self.fd, 4096)
            except BlockingIOError:
                continue
            if not chunk:
                continue
            self._record_rx()
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                text = line.decode("utf-8", errors="replace").strip()
                if not text:
                    continue
                raw_lines.append(text)
                try:
                    message = json.loads(text)
                except json.JSONDecodeError:
                    message = {"type": "log", "seq": 0, "level": "warn", "message": text}
                messages.append(message)
                if seq is not None and is_terminal_message(message, seq):
                    return messages, raw_lines
        return messages, raw_lines


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
        if self.path == "/frame":
            send_json(self, 410, {"ok": False, "error": "raw Feetech frame forwarding has moved to ESP32 semantic commands; use /command", "rxBytes": []})
            return
        if self.path != "/command":
            send_json(self, 404, {"ok": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            command = body.get("command") if isinstance(body, dict) and isinstance(body.get("command"), dict) else body
            result = worker.submit(
                command,
                int(body.get("waitMs", DEFAULT_WAIT_MS)) if isinstance(body, dict) else DEFAULT_WAIT_MS,
                body.get("policy") if isinstance(body, dict) else None,
                body.get("coalesceKey") if isinstance(body, dict) else None,
                body.get("minIntervalMs") if isinstance(body, dict) else None,
            )
            send_json(self, 200, result)
        except Exception as exc:
            send_json(self, 500, {"ok": False, "error": str(exc), "messages": []})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    worker.start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("Pi servo ESP32 bridge listening on %s:%s -> %s @ %s protocol=%s" % (HOST, PORT, SERIAL_PORT, BAUD_RATE, SERIAL_PROTOCOL_MODE), flush=True)
    server.serve_forever()
