#!/usr/bin/env python3
"""Local AI vision helper for the rescue robot console.

The helper is intentionally independent from the web app. It exposes a small
loopback HTTP API that can later be backed by OpenCV, YOLO, or any custom model
without changing the console's core platform contract.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


HOST = "127.0.0.1"
PORT = int(os.environ.get("AI_VISION_PORT", "17353"))
SERVICE = "ai-vision-helper"
DEFAULT_LABEL = "competition_mannequin"
MODE = os.environ.get("AI_VISION_MODE", "sample-only")
MAX_REQUEST_BYTES = 8 * 1024 * 1024
MAX_FRAME_BYTES = 8 * 1024 * 1024
STREAM_TIMEOUT_SECONDS = float(os.environ.get("AI_VISION_STREAM_TIMEOUT", "4"))


def default_sample_dir() -> Path:
    root = os.environ.get("AI_VISION_SAMPLE_DIR")
    if root:
        return Path(root).expanduser()
    home = Path(os.environ.get("USERPROFILE") or Path.home())
    return home / ".rescue-robot" / "ai-vision" / "samples"


SAMPLE_DIR = default_sample_dir()


class AiVisionRequestHandler(BaseHTTPRequestHandler):
    server_version = "RescueRobotAiVision/0.1"

    def do_OPTIONS(self) -> None:
        self.send_json(HTTPStatus.NO_CONTENT, {})

    def do_GET(self) -> None:
        if not self.is_local_request():
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "local requests only"})
            return
        if self.path == "/health":
            self.send_json(HTTPStatus.OK, health_payload())
            return
        self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self) -> None:
        if not self.is_local_request():
            self.send_json(HTTPStatus.FORBIDDEN, {"error": "local requests only"})
            return
        try:
            body = self.read_json_body()
            if self.path == "/analyze":
                self.send_json(HTTPStatus.OK, analyze_stream(body))
                return
            if self.path == "/samples/capture":
                self.send_json(HTTPStatus.OK, capture_sample(body))
                return
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
        except RequestError as error:
            self.send_json(error.status, {"error": str(error)})
        except Exception as error:  # pragma: no cover - defensive server boundary
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error) or "ai vision helper error"})

    def read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length") or "0")
        if length > MAX_REQUEST_BYTES:
            raise RequestError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "request body is too large")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            value = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as error:
            raise RequestError(HTTPStatus.BAD_REQUEST, "request JSON is invalid") from error
        if not isinstance(value, dict):
            raise RequestError(HTTPStatus.BAD_REQUEST, "request body must be an object")
        return value

    def send_json(self, status: HTTPStatus | int, body: dict[str, Any]) -> None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(int(status))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if int(status) != HTTPStatus.NO_CONTENT:
            self.wfile.write(payload)

    def is_local_request(self) -> bool:
        return self.client_address[0] in {"127.0.0.1", "::1", "::ffff:127.0.0.1"}

    def log_message(self, format: str, *args: Any) -> None:
        if os.environ.get("AI_VISION_QUIET") == "1":
            return
        super().log_message(format, *args)


class RequestError(Exception):
    def __init__(self, status: HTTPStatus, message: str) -> None:
        super().__init__(message)
        self.status = status


def health_payload() -> dict[str, Any]:
    return {
        "ok": True,
        "service": SERVICE,
        "mode": MODE,
        "sampleDir": str(SAMPLE_DIR),
        "label": DEFAULT_LABEL,
    }


def analyze_stream(body: dict[str, Any]) -> dict[str, Any]:
    source_id, stream_url = source_fields(body)
    frame = fetch_first_jpeg(stream_url)
    frame_timestamp = int(time.time() * 1000)
    return {
        "ok": True,
        "sourceId": source_id,
        "frameTimestamp": frame_timestamp,
        "mode": MODE,
        "frameBytes": len(frame),
        "detections": mock_detections(source_id, frame_timestamp),
    }


def capture_sample(body: dict[str, Any]) -> dict[str, Any]:
    source_id, stream_url = source_fields(body)
    label = sanitize_label(str(body.get("label") or DEFAULT_LABEL))
    frame = fetch_first_jpeg(stream_url)
    frame_timestamp = int(time.time() * 1000)
    label_dir = SAMPLE_DIR / label
    label_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{frame_timestamp}-{sanitize_label(source_id)}"
    image_path = label_dir / f"{stem}.jpg"
    metadata_path = label_dir / f"{stem}.json"
    image_path.write_bytes(frame)
    metadata = {
        "label": label,
        "sourceId": source_id,
        "streamUrl": stream_url,
        "frameTimestamp": frame_timestamp,
        "bytes": len(frame),
        "service": SERVICE,
        "mode": MODE,
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "ok": True,
        "sourceId": source_id,
        "label": label,
        "imagePath": str(image_path),
        "metadataPath": str(metadata_path),
        "frameTimestamp": frame_timestamp,
        "bytes": len(frame),
    }


def source_fields(body: dict[str, Any]) -> tuple[str, str]:
    source_id = str(body.get("sourceId") or "").strip()
    stream_url = str(body.get("streamUrl") or "").strip()
    if not source_id:
        raise RequestError(HTTPStatus.BAD_REQUEST, "sourceId is required")
    if not stream_url:
        raise RequestError(HTTPStatus.BAD_REQUEST, "streamUrl is required")
    if not stream_url.startswith(("http://", "https://")):
        raise RequestError(HTTPStatus.BAD_REQUEST, "streamUrl must be http or https")
    return source_id, stream_url


def fetch_first_jpeg(stream_url: str) -> bytes:
    request = urllib.request.Request(stream_url, headers={"User-Agent": "rescue-robot-ai-vision/0.1"})
    try:
        with urllib.request.urlopen(request, timeout=STREAM_TIMEOUT_SECONDS) as response:
            buffer = bytearray()
            start = -1
            while len(buffer) < MAX_FRAME_BYTES:
                chunk = response.read(4096)
                if not chunk:
                    break
                buffer.extend(chunk)
                if start < 0:
                    start = buffer.find(b"\xff\xd8")
                if start >= 0:
                    end = buffer.find(b"\xff\xd9", start + 2)
                    if end >= 0:
                        return bytes(buffer[start : end + 2])
    except Exception as error:
        raise RequestError(HTTPStatus.BAD_GATEWAY, f"failed to read camera stream: {error}") from error
    raise RequestError(HTTPStatus.BAD_GATEWAY, "camera stream did not contain a JPEG frame")


def mock_detections(source_id: str, frame_timestamp: int) -> list[dict[str, Any]]:
    if os.environ.get("AI_VISION_MOCK_DETECTION") != "1":
        return []
    bbox = {"x": 0.32, "y": 0.18, "width": 0.28, "height": 0.46}
    return [
        {
            "label": DEFAULT_LABEL,
            "confidence": 0.72,
            "bbox": bbox,
            "center": {"x": bbox["x"] + bbox["width"] / 2, "y": bbox["y"] + bbox["height"] / 2},
            "sourceId": source_id,
            "frameTimestamp": frame_timestamp,
        }
    ]


def sanitize_label(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_.-]+", "-", value.strip()).strip("-._")
    return cleaned or DEFAULT_LABEL


def run_self_test() -> None:
    assert sanitize_label("competition mannequin") == "competition-mannequin"
    assert health_payload()["service"] == SERVICE
    try:
        source_fields({"sourceId": "main", "streamUrl": ""})
    except RequestError as error:
        assert error.status == HTTPStatus.BAD_REQUEST
    else:  # pragma: no cover
        raise AssertionError("missing streamUrl should fail")
    print("ai-vision-helper self-test ok")


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the rescue robot AI vision helper.")
    parser.add_argument("--self-test", action="store_true", help="run helper self checks and exit")
    args = parser.parse_args()
    if args.self_test:
        run_self_test()
        return 0

    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), AiVisionRequestHandler)
    print(f"{SERVICE} listening on http://{HOST}:{server.server_address[1]}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        return 0
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
