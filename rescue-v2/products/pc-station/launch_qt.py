#!/usr/bin/env python3
"""Launch the Rescue V2 Agent and Qt console as independent Windows processes."""

from __future__ import annotations

import argparse
import socket
import subprocess
import time
from pathlib import Path


PYTHON = Path(r"C:\Users\47459\.platformio\penv\Scripts\python.exe")
PYTHONW = Path(r"C:\Users\47459\.platformio\penv\Scripts\pythonw.exe")
AGENT_PORT = 18400


def port_is_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.15):
            return True
    except OSError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent-only", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    logs = root / "logs"
    logs.mkdir(exist_ok=True)
    if not port_is_open(AGENT_PORT):
        with (logs / "control-agent.out.log").open("ab") as stdout, (
            logs / "control-agent.err.log"
        ).open("ab") as stderr:
            subprocess.Popen(
                [
                    str(PYTHON),
                    str(root / "agent" / "rescue_agent.py"),
                    "--pi-host",
                    "192.168.55.131",
                    "--controller-port",
                    "COM5",
                ],
                cwd=root,
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=stderr,
                creationflags=(
                    subprocess.CREATE_NEW_PROCESS_GROUP
                    | subprocess.CREATE_NO_WINDOW
                    | subprocess.DETACHED_PROCESS
                ),
                close_fds=True,
            )
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and not port_is_open(AGENT_PORT):
            time.sleep(0.05)
        if not port_is_open(AGENT_PORT):
            raise RuntimeError("Rescue V2 Agent did not open port 18400")

    if args.agent_only:
        return 0

    subprocess.Popen(
        [str(PYTHONW), str(root / "qt" / "rescue_console.py")],
        cwd=root,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
        close_fds=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
