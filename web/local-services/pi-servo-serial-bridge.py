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

SERVICE = "pi-servo-serial-bridge"
VERSION = "0.1.2"
SERIAL_PORT = os.environ.get("PI_SERVO_SERIAL_PORT", "/dev/serial0")
BAUD_RATE = int(os.environ.get("PI_SERVO_BAUD", "115200"))
HOST = os.environ.get("PI_SERVO_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("PI_SERVO_BRIDGE_PORT", "17354"))
DEFAULT_WAIT_MS = int(os.environ.get("PI_SERVO_WAIT_MS", "120"))
REQUEST_WAIT_MARGIN_SEC = float(os.environ.get("PI_SERVO_REQUEST_WAIT_MARGIN_SEC", "2.0"))
WRITE_ACK_DRAIN_MS = int(os.environ.get("PI_SERVO_WRITE_ACK_DRAIN_MS", "35"))
STALE_RX_DRAIN_MS = int(os.environ.get("PI_SERVO_STALE_RX_DRAIN_MS", "5"))
RESPONSE_RETRIES = int(os.environ.get("PI_SERVO_RESPONSE_RETRIES", "1"))
RESPONSE_RETRY_DELAY_MS = int(os.environ.get("PI_SERVO_RESPONSE_RETRY_DELAY_MS", "20"))
RECONNECT_INTERVAL_SEC = float(os.environ.get("PI_SERVO_RECONNECT_INTERVAL_SEC", "1.0"))
SERIAL_EVENT_LIMIT = int(os.environ.get("PI_SERVO_SERIAL_EVENT_LIMIT", "80"))
LIVE_POLICY_LATEST = "latest"
DEFAULT_LIVE_MIN_INTERVAL_MS = int(os.environ.get("PI_SERVO_LIVE_MIN_INTERVAL_MS", "40"))
DEFAULT_LIVE_ACK_DRAIN_MS = int(os.environ.get("PI_SERVO_LIVE_ACK_DRAIN_MS", "4"))
FEETECH_PING = 0x01
FEETECH_READ = 0x02

BAUD_FLAGS = {
    115200: termios.B115200,
    1000000: getattr(termios, "B1000000", termios.B115200),
}


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


def frame_expects_response(frame):
    if not isinstance(frame, list) or len(frame) < 5:
        return True
    instruction = int(frame[4]) & 0xFF
    return instruction in (FEETECH_PING, FEETECH_READ)


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
        parsed = int(value)
    except (TypeError, ValueError):
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


class SerialWorker:
    def __init__(self):
        self.queue = queue.Queue()
        self.lock = threading.Lock()
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
        self.response_retry_count = 0
        self.live_skipped = 0
        self.live_rate_limited = 0
        self.live_latest_request_by_key = {}
        self.live_last_sent_at_by_key = {}
        self.in_flight = False
        self.in_flight_request_id = None
        self.thread = threading.Thread(target=self._run, name="pi-servo-serial-worker", daemon=True)
        self.reconnect_thread = threading.Thread(target=self._reconnect_loop, name="pi-servo-serial-reconnect", daemon=True)

    def start(self):
        try:
            self._ensure_serial()
        except Exception as exc:
            self._record_error("startup open failed: %s" % exc)
        self.thread.start()
        self.reconnect_thread.start()

    def submit(self, frame, wait_ms, policy=None, coalesce_key=None, min_interval_ms=None, ack_drain_ms=None):
        if not isinstance(frame, list) or not frame:
            raise ValueError("frame must be a non-empty byte array")
        wait_ms = max(10, int(wait_ms))
        live_policy = LIVE_POLICY_LATEST if policy == LIVE_POLICY_LATEST and coalesce_key else None
        live_key = str(coalesce_key) if live_policy else None
        live_min_interval_ms = clamp_int(min_interval_ms, DEFAULT_LIVE_MIN_INTERVAL_MS, 0, 1000) if live_policy else None
        live_ack_drain_ms = clamp_int(ack_drain_ms, DEFAULT_LIVE_ACK_DRAIN_MS, 0, 1000) if live_policy else None
        response_queue = queue.Queue(maxsize=1)
        with self.lock:
            self.request_count += 1
            request_id = self.request_count
            if live_key:
                self.live_latest_request_by_key[live_key] = request_id
        self.queue.put({
            "id": request_id,
            "frame": frame,
            "wait_ms": wait_ms,
            "policy": live_policy,
            "coalesce_key": live_key,
            "min_interval_ms": live_min_interval_ms,
            "ack_drain_ms": live_ack_drain_ms,
            "response_queue": response_queue,
        })
        print("pi-servo request %s queued bytes=%s depth=%s" % (
            request_id,
            len(frame),
            self.queue.qsize(),
        ), flush=True)
        try:
            return response_queue.get(timeout=wait_ms / 1000.0 + REQUEST_WAIT_MARGIN_SEC)
        except queue.Empty:
            self._record_error("request %s timed out waiting for serial worker" % request_id)
            self._record_serial_event("worker_timeout", "request timed out waiting for serial worker", requestId=request_id, waitMs=wait_ms)
            return {
                "ok": False,
                "rxBytes": [],
                "serialPort": SERIAL_PORT,
                "baudRate": BAUD_RATE,
                "error": "serial worker timed out",
            }

    def stats(self):
        with self.lock:
            return {
                "serialOpen": self.fd is not None,
                "queueDepth": self.queue.qsize(),
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
                "responseRetries": self.response_retry_count,
                "liveSkipped": self.live_skipped,
                "liveRateLimited": self.live_rate_limited,
                "liveLastSentAtByKey": {key: round(value, 3) for key, value in self.live_last_sent_at_by_key.items()},
                "uptimeSec": round(time.time() - self.started_at, 1),
            }

    def diagnostics(self):
        with self.lock:
            return {
                "serialOpen": self.fd is not None,
                "serialPort": SERIAL_PORT,
                "baudRate": BAUD_RATE,
                "device": serial_device_snapshot(),
                "queueDepth": self.queue.qsize(),
                "inFlight": self.in_flight,
                "inFlightRequestId": self.in_flight_request_id,
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
                "droppedRxBytes": self.dropped_rx_bytes,
                "lastDroppedRxAt": round(self.last_dropped_rx_at, 3) if self.last_dropped_rx_at is not None else None,
                "responseRetries": self.response_retry_count,
                "liveSkipped": self.live_skipped,
                "liveRateLimited": self.live_rate_limited,
                "liveLastSentAtByKey": {key: round(value, 3) for key, value in self.live_last_sent_at_by_key.items()},
                "uptimeSec": round(time.time() - self.started_at, 1),
            }

    def _record_serial_event(self, kind, message=None, **extra):
        event = {
            "at": round(time.time(), 3),
            "kind": kind,
            "serialOpen": self.fd is not None,
            "deviceExists": os.path.exists(SERIAL_PORT),
            "queueDepth": self.queue.qsize(),
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
        print("pi-servo dropped stale rx bytes=%s total=%s" % (count, self.dropped_rx_bytes), flush=True)
        self._record_serial_event("stale_rx_dropped", "dropped bytes already waiting in the serial input buffer", droppedBytes=count)

    def _record_response_retry(self):
        with self.lock:
            self.response_retry_count += 1
        print("pi-servo retrying response request total=%s" % self.response_retry_count, flush=True)
        self._record_serial_event("response_retry", "no response bytes before retry; resending request frame")

    def _live_skip_response(self, job):
        key = job.get("coalesce_key")
        if job.get("policy") != LIVE_POLICY_LATEST or not key:
            return None
        with self.lock:
            if self.live_latest_request_by_key.get(key) == job["id"]:
                return None
            self.live_skipped += 1
        self._record_serial_event(
            "live_stale_skipped",
            "skipped stale live servo frame",
            requestId=job["id"],
            coalesceKey=key,
        )
        return {
            "ok": True,
            "rxBytes": [],
            "serialPort": SERIAL_PORT,
            "baudRate": BAUD_RATE,
            "responseExpected": False,
            "skipped": True,
            "reason": "stale",
        }

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

    def _record_reconnect(self):
        with self.lock:
            self.reconnect_count += 1
            self.last_reconnect_at = time.time()
            self.last_error = None
            self.consecutive_open_failures = 0
        print("pi-servo serial reconnected %s @ %s total=%s" % (
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
                self._record_reconnect()
            except Exception as exc:
                self._record_error("auto reconnect failed: %s" % exc)

    def _run(self):
        while True:
            job = self.queue.get()
            request_id = job["id"]
            response_queue = job["response_queue"]
            with self.lock:
                self.in_flight = True
                self.in_flight_request_id = request_id
            try:
                response_expected = frame_expects_response(job["frame"])
                skipped = self._live_skip_response(job)
                if skipped is not None:
                    response_queue.put(skipped)
                    continue
                delay = self._live_rate_limit_delay(job)
                if delay > 0:
                    self._record_serial_event(
                        "live_rate_limited",
                        "delaying live servo frame to respect per-key interval",
                        requestId=request_id,
                        coalesceKey=job.get("coalesce_key"),
                        delayMs=round(delay * 1000, 1),
                    )
                    time.sleep(delay)
                    skipped = self._live_skip_response(job)
                    if skipped is not None:
                        response_queue.put(skipped)
                        continue
                rx = self._send_frame(job["frame"], job["wait_ms"], response_expected, job.get("ack_drain_ms"))
                self._record_live_sent(job)
                response_queue.put({
                    "ok": len(rx) > 0 or not response_expected,
                    "rxBytes": list(rx),
                    "serialPort": SERIAL_PORT,
                    "baudRate": BAUD_RATE,
                    "responseExpected": response_expected,
                })
                if response_expected and not rx:
                    self._record_error("request %s returned no serial bytes" % request_id)
                    self._record_serial_event("no_response", "request expected a serial response but received no bytes", requestId=request_id, waitMs=job["wait_ms"], frameHead=list(job["frame"][:6]))
            except Exception as exc:
                self._record_error("request %s failed: %s" % (request_id, exc))
                self._record_serial_event("request_failed", "serial request raised an exception", requestId=request_id, exception=exception_detail(exc))
                self._close_serial("request_failed", exc)
                response_queue.put({
                    "ok": False,
                    "rxBytes": [],
                    "serialPort": SERIAL_PORT,
                    "baudRate": BAUD_RATE,
                    "error": str(exc),
                })
            finally:
                with self.lock:
                    self.in_flight = False
                    self.in_flight_request_id = None
                self.queue.task_done()

    def _send_frame(self, frame, wait_ms, response_expected, ack_drain_ms=None):
        payload = bytes(int(byte) & 0xFF for byte in frame)
        fd = self._ensure_serial()
        dropped_before = self._drain_rx(STALE_RX_DRAIN_MS)
        if dropped_before:
            self._record_dropped_rx(dropped_before)
        os.write(fd, payload)
        read_ms = wait_ms if response_expected else (ack_drain_ms if ack_drain_ms is not None else max(wait_ms, WRITE_ACK_DRAIN_MS))
        rx = self._read_response(read_ms)
        if not response_expected:
            self._record_dropped_rx(len(rx))
            return b""
        retries = max(0, RESPONSE_RETRIES)
        for _ in range(retries):
            if rx:
                break
            self._record_response_retry()
            if RESPONSE_RETRY_DELAY_MS > 0:
                time.sleep(RESPONSE_RETRY_DELAY_MS / 1000.0)
            dropped_retry = self._drain_rx(STALE_RX_DRAIN_MS)
            if dropped_retry:
                self._record_dropped_rx(dropped_retry)
            os.write(fd, payload)
            rx = self._read_response(wait_ms)
        return rx

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

    def _read_response(self, wait_ms):
        deadline = time.monotonic() + max(10, wait_ms) / 1000.0
        rx = b""
        while time.monotonic() < deadline:
            remaining = max(0.0, deadline - time.monotonic())
            readable, _, _ = select.select([self.fd], [], [], min(0.02, remaining))
            if not readable:
                continue
            try:
                chunk = os.read(self.fd, 4096)
            except BlockingIOError:
                continue
            if chunk:
                rx += chunk
                self._record_rx()
        return rx


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
        if self.path != "/frame":
            send_json(self, 404, {"ok": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            result = worker.submit(
                body.get("frame", []),
                int(body.get("waitMs", DEFAULT_WAIT_MS)),
                body.get("policy"),
                body.get("coalesceKey"),
                body.get("minIntervalMs"),
                body.get("ackDrainMs"),
            )
            send_json(self, 200, result)
        except Exception as exc:
            send_json(self, 500, {"ok": False, "error": str(exc), "rxBytes": []})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    worker.start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("Pi servo serial bridge listening on %s:%s -> %s @ %s" % (HOST, PORT, SERIAL_PORT, BAUD_RATE), flush=True)
    server.serve_forever()
