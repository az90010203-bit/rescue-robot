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

BAUD_FLAGS = {
    9600: termios.B9600,
    19200: termios.B19200,
    38400: termios.B38400,
    57600: termios.B57600,
    115200: termios.B115200,
}

TERMINAL_TYPES = ("error", "motor.feedback", "mecanum.feedback", "can.feedback", "can.frame", "can_servo.feedback", "imu.feedback")
ACK_ONLY_COMMANDS = ("debug.set",)
LATEST_WINS_TYPES = ("motor.target", "mecanum.target", "can_servo.move")
STOP_TYPES = ("motor.stop", "mecanum.stop")
LOW_PRIORITY_TYPES = ("imu.read",)


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
        return isinstance(command, dict) and command.get("type") in LATEST_WINS_TYPES

    def _is_stop_command(self, command):
        return isinstance(command, dict) and command.get("type") in STOP_TYPES

    def _is_low_priority_command(self, command):
        return isinstance(command, dict) and command.get("type") in LOW_PRIORITY_TYPES

    def _queue_depth_locked(self):
        return len(self.queue) + (1 if self.pending_motion_job is not None else 0)

    def _queue_depth(self):
        with self.lock:
            return self._queue_depth_locked()

    def _dropped_response(self, job, reason):
        command = job.get("command", {})
        return {
            "ok": False,
            "busy": True,
            "accepted": False,
            "dropped": True,
            "messages": [{
                "type": "scheduler.feedback",
                "seq": command.get("seq", 0),
                "command": command.get("type"),
                "accepted": False,
                "motionPending": self.pending_motion_job is not None,
                "latestMotionSeq": self.latest_motion_seq,
                "droppedMotionCount": self.dropped_motion_count,
                "activeCommand": self.active_command,
                "message": reason,
            }],
            "serialPort": SERIAL_PORT,
            "baudRate": BAUD_RATE,
            "queueDepth": self._queue_depth_locked(),
            "inFlight": self.in_flight,
        }

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
        return {
            "ok": False,
            "busy": True,
            "accepted": False,
            "telemetrySkipped": True,
            "messages": [{
                "type": "scheduler.feedback",
                "seq": command.get("seq", 0),
                "command": command.get("type"),
                "accepted": False,
                "motionPending": self.pending_motion_job is not None,
                "latestMotionSeq": self.latest_motion_seq,
                "droppedMotionCount": self.dropped_motion_count,
                "activeCommand": self.active_command,
                "message": reason,
            }],
            "serialPort": SERIAL_PORT,
            "baudRate": BAUD_RATE,
            "queueDepth": self._queue_depth_locked(),
            "inFlight": self.in_flight,
        }

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
                self.queue.append(job)
            elif self._is_stop_command(command):
                self._drop_queued_low_priority_locked("preempted by stop command")
                self._drop_pending_motion_locked("cleared by stop command")
                self.queue.appendleft(job)
            elif self._is_latest_wins_command(command):
                self._drop_queued_low_priority_locked("preempted by motion command")
                if self.in_flight or self.queue or self.pending_motion_job is not None:
                    self._drop_pending_motion_locked("replaced by newer motion target")
                    self.pending_motion_job = job
                    self.latest_motion_seq = command.get("seq")
                else:
                    self.queue.append(job)
                    self.latest_motion_seq = command.get("seq")
            else:
                self._drop_queued_low_priority_locked("preempted by control command")
                self.queue.append(job)
            self.condition.notify()

    def _next_job(self):
        with self.condition:
            while not self.queue and self.pending_motion_job is None:
                self.condition.wait()
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
        return {
            "ok": False,
            "busy": True,
            "accepted": False,
            "messages": [],
            "serialPort": SERIAL_PORT,
            "baudRate": BAUD_RATE,
            "queueDepth": queue_depth,
            "inFlight": in_flight,
        }

    def stats(self):
        with self.lock:
            queue_depth = self._queue_depth_locked()
            return {
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

    def diagnostics(self):
        with self.lock:
            return {
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
                response_queue.put({
                    "ok": matched,
                    "busy": False,
                    "accepted": True,
                    "messages": messages,
                    "serialPort": SERIAL_PORT,
                    "baudRate": BAUD_RATE,
                    "queueDepth": self._queue_depth(),
                    "inFlight": True,
                })
                if not matched:
                    self._record_error("request %s seq=%s timed out or did not match response" % (
                        request_id,
                        command.get("seq"),
                    ))
                    self._record_serial_event("no_matching_response", "request did not receive a terminal response for the same seq", requestId=request_id, seq=command.get("seq"), timeoutMs=job["timeout_ms"], commandType=command.get("type"), messagesSeen=len(messages))
            except Exception as exc:
                self._record_error("request %s failed: %s" % (request_id, exc))
                self._record_serial_event("request_failed", "serial request raised an exception", requestId=request_id, seq=command.get("seq"), commandType=command.get("type"), exception=exception_detail(exc))
                self._close_serial("request_failed", exc)
                response_queue.put({
                    "ok": False,
                    "busy": False,
                    "accepted": True,
                    "messages": [],
                    "serialPort": SERIAL_PORT,
                    "baudRate": BAUD_RATE,
                    "error": str(exc),
                })
            finally:
                with self.lock:
                    self.in_flight = False
                    self.in_flight_request_id = None
                    self.active_command = None

    def _send_command(self, command, timeout_ms):
        fd = self._ensure_serial()
        payload = (json.dumps(command, separators=(",", ":")) + "\n").encode("utf-8")
        os.write(fd, payload)
        return self._read_lines_until(command.get("seq"), timeout_ms, command.get("type"))

    def _read_lines_until(self, seq, timeout_ms, command_type):
        deadline = time.monotonic() + timeout_ms / 1000.0
        settle_deadline = None
        messages = []
        matched = False
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
                if not isinstance(message, dict) or message.get("seq") != seq:
                    continue
                message_type = message.get("type")
                if message_type == "ack" and command_type in ACK_ONLY_COMMANDS:
                    return messages, True
                if message_type == "error":
                    return messages, True
                if command_type == "can.send" and message_type in ("can.feedback", "can.frame"):
                    matched = True
                    settle_deadline = min(deadline, time.monotonic() + 0.12)
                    continue
                if message_type in TERMINAL_TYPES:
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
