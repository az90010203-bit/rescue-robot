#!/usr/bin/env python3
import json
import os
import select
import sys
import termios
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SERIAL_PORT = os.environ.get("A_BOARD_SERIAL_PORT", "/dev/ttyAMA5")
BAUD_RATE = int(os.environ.get("A_BOARD_BAUD", "115200"))
HOST = os.environ.get("A_BOARD_BRIDGE_HOST", "0.0.0.0")
PORT = int(os.environ.get("A_BOARD_BRIDGE_PORT", "17353"))
DEFAULT_TIMEOUT_MS = int(os.environ.get("A_BOARD_TIMEOUT_MS", "1200"))

BAUD_FLAGS = {
    9600: termios.B9600,
    19200: termios.B19200,
    38400: termios.B38400,
    57600: termios.B57600,
    115200: termios.B115200,
}


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


def read_lines_until(fd, seq, timeout_ms, command_type):
    deadline = time.monotonic() + timeout_ms / 1000.0
    settle_deadline = None
    buffer = b""
    messages = []
    while True:
        active_deadline = settle_deadline if settle_deadline is not None else deadline
        if time.monotonic() >= active_deadline:
            return messages
        remaining = max(0.0, active_deadline - time.monotonic())
        readable, _, _ = select.select([fd], [], [], min(0.05, remaining))
        if not readable:
            continue
        try:
            chunk = os.read(fd, 4096)
        except BlockingIOError:
            continue
        if not chunk:
            continue
        buffer += chunk
        while b"\n" in buffer:
            line, buffer = buffer.split(b"\n", 1)
            text = line.decode("utf-8", errors="replace").strip()
            if not text:
                continue
            try:
                message = json.loads(text)
            except json.JSONDecodeError:
                message = {"type": "log", "message": text}
            messages.append(message)
            message_type = message.get("type")
            if message.get("seq") != seq:
                continue
            if message_type in ("error", "motor.feedback"):
                return messages
            if command_type == "can.send" and message_type == "can.feedback":
                settle_deadline = min(deadline, time.monotonic() + 0.12)
                continue
            if message_type in ("can.feedback", "can.frame", "imu.feedback"):
                return messages


def send_command(command, timeout_ms):
    seq = command.get("seq")
    if not isinstance(seq, int):
        raise ValueError("command.seq must be an integer")
    fd = open_serial()
    try:
        os.write(fd, (json.dumps(command, separators=(",", ":")) + "\n").encode("utf-8"))
        return read_lines_until(fd, seq, timeout_ms, command.get("type"))
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
        if self.path != "/command":
            send_json(self, 404, {"ok": False, "error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            command = body.get("command", body)
            timeout_ms = int(body.get("timeoutMs", DEFAULT_TIMEOUT_MS))
            messages = send_command(command, timeout_ms)
            matched = any(
                message.get("seq") == command.get("seq")
                and message.get("type") in ("error", "motor.feedback", "can.feedback", "can.frame", "imu.feedback")
                for message in messages
                if isinstance(message, dict)
            )
            send_json(self, 200, {"ok": matched, "messages": messages, "serialPort": SERIAL_PORT, "baudRate": BAUD_RATE})
        except Exception as exc:
            send_json(self, 500, {"ok": False, "error": str(exc), "messages": []})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("A board serial bridge listening on %s:%s -> %s @ %s" % (HOST, PORT, SERIAL_PORT, BAUD_RATE), flush=True)
    server.serve_forever()
