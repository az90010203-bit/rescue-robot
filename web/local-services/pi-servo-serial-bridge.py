#!/usr/bin/env python3
import json
import os
import select
import sys
import termios
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERIAL_PORT = os.environ.get("PI_SERVO_SERIAL_PORT", "/dev/serial0")
BAUD_RATE = int(os.environ.get("PI_SERVO_BAUD", "115200"))
HOST = os.environ.get("PI_SERVO_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("PI_SERVO_BRIDGE_PORT", "17354"))
DEFAULT_WAIT_MS = int(os.environ.get("PI_SERVO_WAIT_MS", "120"))

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


def read_response(fd, wait_ms):
    deadline = time.monotonic() + max(10, wait_ms) / 1000.0
    rx = b""
    while time.monotonic() < deadline:
        remaining = max(0.0, deadline - time.monotonic())
        readable, _, _ = select.select([fd], [], [], min(0.02, remaining))
        if not readable:
            continue
        try:
            chunk = os.read(fd, 4096)
        except BlockingIOError:
            continue
        if chunk:
            rx += chunk
    return rx


def send_frame(frame, wait_ms):
    if not isinstance(frame, list) or not frame:
        raise ValueError("frame must be a non-empty byte array")
    payload = bytes(int(byte) & 0xFF for byte in frame)
    fd = open_serial()
    try:
        termios.tcflush(fd, termios.TCIOFLUSH)
        os.write(fd, payload)
        return read_response(fd, wait_ms)
    finally:
        os.close(fd)


def send_json(handler, status, body):
    payload = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "content-type")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_json(self, 200, {"ok": True})

    def do_GET(self):
        if self.path != "/health":
            send_json(self, 404, {"ok": False, "error": "not found"})
            return
        exists = os.path.exists(SERIAL_PORT)
        send_json(self, 200, {"ok": exists, "serialPort": SERIAL_PORT, "baudRate": BAUD_RATE})

    def do_POST(self):
        if self.path != "/frame":
            send_json(self, 404, {"ok": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            frame = body.get("frame", [])
            wait_ms = int(body.get("waitMs", DEFAULT_WAIT_MS))
            rx = send_frame(frame, wait_ms)
            send_json(self, 200, {
                "ok": len(rx) > 0,
                "rxBytes": list(rx),
                "serialPort": SERIAL_PORT,
                "baudRate": BAUD_RATE
            })
        except Exception as exc:
            send_json(self, 500, {"ok": False, "error": str(exc), "rxBytes": []})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("Pi servo serial bridge listening on %s:%s -> %s @ %s" % (HOST, PORT, SERIAL_PORT, BAUD_RATE), flush=True)
    server.serve_forever()
