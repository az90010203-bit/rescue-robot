#!/usr/bin/env python3
"""Qt 6 operator console for Rescue V2."""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any, Callable

from PySide6.QtCore import QByteArray, QObject, QProcess, Qt, QTimer, QUrl, Signal
from PySide6.QtGui import QCloseEvent, QKeyEvent
from PySide6.QtMultimedia import QMediaPlayer
from PySide6.QtMultimediaWidgets import QVideoWidget
from PySide6.QtNetwork import QNetworkAccessManager, QNetworkReply, QNetworkRequest
from PySide6.QtWebEngineCore import QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import (
    QApplication,
    QButtonGroup,
    QCheckBox,
    QComboBox,
    QFormLayout,
    QFrame,
    QGridLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QSlider,
    QSpinBox,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

AGENT_URL = "http://127.0.0.1:18400"
CAMERA_URL = "http://192.168.55.131:8080"


def restart_script_path() -> Path:
    return Path(__file__).resolve().parents[1] / "restart-control.ps1"


class AgentClient(QObject):
    health_received = Signal(dict)
    error_received = Signal(str)
    network_error_received = Signal(str)
    armed_changed = Signal(bool)
    operation_received = Signal(str)

    def __init__(self) -> None:
        super().__init__()
        self._network = QNetworkAccessManager(self)
        self._health_busy = False
        self._heartbeat_busy = False

    def health(self) -> None:
        if self._health_busy:
            return
        self._health_busy = True
        self._send(
            "GET",
            "/v2/health",
            None,
            self.health_received.emit,
            accept_not_ok=True,
            settled=lambda: setattr(self, "_health_busy", False),
        )

    def heartbeat(self) -> None:
        if self._heartbeat_busy:
            return
        self._heartbeat_busy = True
        self._send(
            "POST",
            "/v2/ui/heartbeat",
            {},
            None,
            quiet=True,
            settled=lambda: setattr(self, "_heartbeat_busy", False),
        )

    def arm(self) -> None:
        def completed(_: dict[str, Any]) -> None:
            self.armed_changed.emit(True)
            self.operation_received.emit("控制已解锁，可以操作运动按钮")

        self._send("POST", "/v2/control/arm", {}, completed)

    def stop(self, reason: str) -> None:
        def completed(_: dict[str, Any]) -> None:
            self.armed_changed.emit(False)
            self.operation_received.emit("整机已停止并锁定")

        self._send("POST", "/v2/control/stop", {"reason": reason}, completed)

    def drive(self, forward: int, strafe: int, turn: int, speed: int) -> None:
        self._send(
            "POST",
            "/v2/control/drive",
            {
                "forwardMilli": forward,
                "strafeMilli": strafe,
                "turnMilli": turn,
                "speedLimitPercent": speed,
                "deadman": True,
            },
            None,
            quiet=True,
        )

    def speed_limits(self, mecanum: int, tracked: int) -> None:
        self._send(
            "POST",
            "/v2/control/speed-limits",
            {"mecanumPercent": mecanum, "trackedPercent": tracked},
            None,
            quiet=True,
        )

    def capability(self, name: str, body: dict[str, Any]) -> None:
        callback = None
        if name != "tracked":
            callback = lambda _: self.operation_received.emit(f"{name} 命令已接受")
        self._send("POST", f"/v2/capability/{name}", body, callback)

    def _send(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None,
        callback: Callable[[dict[str, Any]], None] | None,
        *,
        quiet: bool = False,
        accept_not_ok: bool = False,
        settled: Callable[[], None] | None = None,
    ) -> None:
        request = QNetworkRequest(QUrl(f"{AGENT_URL}{path}"))
        request.setHeader(QNetworkRequest.ContentTypeHeader, "application/json")
        payload = QByteArray() if body is None else QByteArray(json.dumps(body, separators=(",", ":")).encode())
        reply = self._network.get(request) if method == "GET" else self._network.post(request, payload)

        def finished() -> None:
            try:
                raw = bytes(reply.readAll())
                value = json.loads(raw) if raw else {}
                if reply.error() != QNetworkReply.NoError:
                    if not quiet:
                        detail = str(value.get("error") or reply.errorString())
                        if detail == "Unknown error":
                            detail = "控制 Agent 连接被重置，正在自动恢复"
                        self.network_error_received.emit(detail)
                    return
                if value.get("ok") is False and not accept_not_ok:
                    if not quiet:
                        self.error_received.emit(str(value.get("error") or "请求被拒绝"))
                    return
                if callback is not None:
                    callback(value)
            except Exception as error:
                if not quiet:
                    self.network_error_received.emit(str(error))
            finally:
                if settled is not None:
                    settled()
                reply.deleteLater()

        reply.finished.connect(finished)


class StatusCard(QFrame):
    def __init__(self, title: str, value: str = "等待连接") -> None:
        super().__init__()
        self.setObjectName("statusCard")
        layout = QVBoxLayout(self)
        title_label = QLabel(title)
        title_label.setObjectName("muted")
        self.value = QLabel(value)
        self.value.setObjectName("statusValue")
        self.value.setWordWrap(True)
        layout.addWidget(title_label)
        layout.addWidget(self.value)


class GlobalControlBar(QFrame):
    stop_requested = Signal(str)
    restart_requested = Signal()

    def __init__(self) -> None:
        super().__init__()
        self.setObjectName("controlBar")
        self._online = False
        self._armed = False
        layout = QHBoxLayout(self)
        layout.setContentsMargins(18, 10, 18, 10)
        self.state = QLabel("正在连接控制 Agent…")
        self.state.setObjectName("controlState")
        self.message = QLabel("无需解锁，按下运动按钮时自动建立控制通道")
        self.message.setObjectName("muted")
        self.message.setWordWrap(True)
        self.stop_button = QPushButton("整机急停")
        self.stop_button.setObjectName("danger")
        self.stop_button.clicked.connect(lambda: self.stop_requested.emit("qt_global_emergency_stop"))
        self.restart_button = QPushButton("重启控制软件")
        self.restart_button.setToolTip("安全停止后重启 PC Agent 与 Qt，不重启树莓派或控制器")
        self.restart_button.clicked.connect(self.restart_requested.emit)
        layout.addWidget(self.state)
        layout.addWidget(self.message, 1)
        layout.addWidget(self.restart_button)
        layout.addWidget(self.stop_button)
        self.set_state(False, False)

    def set_state(self, online: bool, armed: bool) -> None:
        self._online = online
        self._armed = armed
        if not online:
            self.state.setText("Agent 离线")
        elif armed:
            self.state.setText("控制通道活动")
        else:
            self.state.setText("控制就绪")
        self.setProperty("armed", online and armed)
        self.style().unpolish(self)
        self.style().polish(self)

    def show_message(self, message: str, *, error: bool = False) -> None:
        self.message.setText(message)
        self.message.setProperty("error", error)
        self.message.style().unpolish(self.message)
        self.message.style().polish(self.message)


class DrivePage(QWidget):
    drive_changed = Signal()
    stop_requested = Signal(str)
    speed_limits_changed = Signal(int, int)

    MECANUM_CONTROLS = {
        "forward",
        "backward",
        "left",
        "right",
        "turn-left",
        "turn-right",
    }
    TRACKED_CONTROLS = {
        "left-forward",
        "right-forward",
        "left-backward",
        "right-backward",
    }
    L_HOLD_SECONDS = 0.7
    SPEED_MODES = (
        ("CRUISE MODE", 30, 30),
        ("TURBO MODE", 50, 60),
        ("HYPER MODE", 70, 100),
    )
    KEY_MAP = {
        Qt.Key_W: "forward",
        Qt.Key_S: "backward",
        Qt.Key_A: "left",
        Qt.Key_D: "right",
        Qt.Key_Q: "turn-left",
        Qt.Key_E: "turn-right",
    }

    def __init__(self) -> None:
        super().__init__()
        self.controls: set[str] = set()
        self.armed = False
        self.drive_mode = "mecanum"
        self.speed_level: int | None = 1
        self._l_pressed_at: float | None = None
        root = QVBoxLayout(self)
        root.setSpacing(18)
        root.addWidget(page_title("整机操作", "底盘、履带与整机急停"))

        cards = QGridLayout()
        self.agent_card = StatusCard("PC Agent")
        self.pi_card = StatusCard("树莓派")
        self.a_board_card = StatusCard("RoboMaster A板")
        self.safety_card = StatusCard("安全状态", "控制就绪")
        for index, card in enumerate((self.agent_card, self.pi_card, self.a_board_card, self.safety_card)):
            cards.addWidget(card, 0, index)
        root.addLayout(cards)

        actions = QHBoxLayout()
        self.stop_button = QPushButton("整机急停")
        self.stop_button.setObjectName("danger")
        self.mode_button = QPushButton()
        self.mode_button.setMinimumHeight(44)
        self.mode_button.setToolTip(
            "短按切换麦轮/履带；按住 700 ms 循环 CRUISE/TURBO/HYPER"
        )
        self.mecanum_speed = QSlider(Qt.Horizontal)
        self.mecanum_speed.setRange(30, 70)
        self.mecanum_speed.setValue(50)
        self.mecanum_speed_label = QLabel("麦轮 50%")
        self.tracked_speed = QSlider(Qt.Horizontal)
        self.tracked_speed.setRange(30, 100)
        self.tracked_speed.setValue(60)
        self.tracked_speed_label = QLabel("履带 60%")
        self.mecanum_speed.valueChanged.connect(self._speed_limits_updated)
        self.tracked_speed.valueChanged.connect(self._speed_limits_updated)
        self.stop_button.clicked.connect(lambda: self.stop_requested.emit("qt_emergency_stop"))
        self.mode_button.pressed.connect(self.l_button_pressed)
        self.mode_button.released.connect(self.l_button_released)
        actions.addWidget(self.stop_button)
        actions.addWidget(self.mode_button)
        actions.addSpacing(20)
        actions.addWidget(self.mecanum_speed_label)
        actions.addWidget(self.mecanum_speed, 1)
        actions.addSpacing(16)
        actions.addWidget(self.tracked_speed_label)
        actions.addWidget(self.tracked_speed, 1)
        root.addLayout(actions)

        controls = QHBoxLayout()
        self.mecanum_group = QGroupBox("麦克纳姆底盘")
        grid = QGridLayout(self.mecanum_group)
        definitions = [
            ("左转\nQ", "turn-left", 0, 0),
            ("前进\nW", "forward", 0, 1),
            ("右转\nE", "turn-right", 0, 2),
            ("左移\nA", "left", 1, 0),
            ("后退\nS", "backward", 1, 1),
            ("右移\nD", "right", 1, 2),
        ]
        self.drive_buttons: dict[str, QPushButton] = {}
        self.motion_buttons: list[QPushButton] = []
        for text, control, row, column in definitions:
            button = QPushButton(text)
            button.setMinimumHeight(90)
            button.pressed.connect(lambda name=control: self.set_control(name, True))
            button.released.connect(lambda name=control: self.set_control(name, False))
            self.drive_buttons[control] = button
            self.motion_buttons.append(button)
            grid.addWidget(button, row, column)
        controls.addWidget(self.mecanum_group, 1)

        self.tracked_group = QGroupBox("履带")
        tracked = QGridLayout(self.tracked_group)
        self.tracked_buttons: dict[str, QPushButton] = {}
        for text, action, row, column in (
            ("左履带前", "left-forward", 0, 0),
            ("右履带前", "right-forward", 0, 1),
            ("左履带后", "left-backward", 1, 0),
            ("右履带后", "right-backward", 1, 1),
        ):
            button = QPushButton(text)
            button.setMinimumHeight(90)
            button.pressed.connect(lambda name=action: self.set_control(name, True))
            button.released.connect(lambda name=action: self.set_control(name, False))
            self.tracked_buttons[action] = button
            self.motion_buttons.append(button)
            tracked.addWidget(button, row, column)
        controls.addWidget(self.tracked_group, 1)
        root.addLayout(controls)
        root.addStretch()
        self._apply_drive_mode()

    def _speed_limits_updated(self) -> None:
        mecanum = self.mecanum_speed.value()
        tracked = self.tracked_speed.value()
        self.speed_level = next(
            (
                index
                for index, (_name, mecanum_percent, tracked_percent)
                in enumerate(self.SPEED_MODES)
                if (mecanum, tracked) == (mecanum_percent, tracked_percent)
            ),
            None,
        )
        self.mecanum_speed_label.setText(f"麦轮 {mecanum}%")
        self.tracked_speed_label.setText(f"履带 {tracked}%")
        self._update_l_button_text()
        self.speed_limits_changed.emit(mecanum, tracked)

    def set_armed(self, armed: bool) -> None:
        self.armed = armed
        self.safety_card.value.setText("通道活动" if armed else "控制就绪")
        self.safety_card.setProperty("online", armed)
        self.safety_card.style().unpolish(self.safety_card)
        self.safety_card.style().polish(self.safety_card)

    def toggle_drive_mode(self) -> None:
        self.controls.clear()
        for button in (
            list(self.drive_buttons.values())
            + list(self.tracked_buttons.values())
        ):
            button.setProperty("active", False)
            button.style().unpolish(button)
            button.style().polish(button)
        self.drive_mode = (
            "tracked" if self.drive_mode == "mecanum" else "mecanum"
        )
        self._apply_drive_mode()
        self.stop_requested.emit("qt_drive_mode_changed")
        self.drive_changed.emit()

    def l_button_pressed(self) -> None:
        if self._l_pressed_at is None:
            self._l_pressed_at = time.monotonic()

    def l_button_released(self) -> None:
        if self._l_pressed_at is None:
            return
        held_seconds = time.monotonic() - self._l_pressed_at
        self._l_pressed_at = None
        self.activate_l_button(held_seconds)

    def activate_l_button(self, held_seconds: float) -> None:
        if held_seconds >= self.L_HOLD_SECONDS:
            self.cycle_speed_level()
        else:
            self.toggle_drive_mode()

    def cycle_speed_level(self) -> None:
        next_level = (
            0
            if self.speed_level is None
            else (self.speed_level + 1) % len(self.SPEED_MODES)
        )
        _name, mecanum_percent, tracked_percent = self.SPEED_MODES[next_level]
        self.mecanum_speed.blockSignals(True)
        self.tracked_speed.blockSignals(True)
        try:
            self.mecanum_speed.setValue(mecanum_percent)
            self.tracked_speed.setValue(tracked_percent)
        finally:
            self.mecanum_speed.blockSignals(False)
            self.tracked_speed.blockSignals(False)
        self.speed_level = next_level
        self.mecanum_speed_label.setText(f"麦轮 {mecanum_percent}%")
        self.tracked_speed_label.setText(f"履带 {tracked_percent}%")
        self._update_l_button_text()
        self.speed_limits_changed.emit(mecanum_percent, tracked_percent)

    def _apply_drive_mode(self) -> None:
        mecanum_active = self.drive_mode == "mecanum"
        self.mecanum_group.setEnabled(mecanum_active)
        self.tracked_group.setEnabled(not mecanum_active)
        self._update_l_button_text()

    def _update_l_button_text(self) -> None:
        mode_name = "麦轮" if self.drive_mode == "mecanum" else "履带"
        speed_mode = (
            "CUSTOM MODE"
            if self.speed_level is None
            else self.SPEED_MODES[self.speed_level][0]
        )
        speed_percent = (
            self.mecanum_speed.value()
            if self.drive_mode == "mecanum"
            else self.tracked_speed.value()
        )
        self.mode_button.setText(
            f"L：{mode_name} | {speed_mode} · {speed_percent}%"
        )

    def set_control(self, name: str, active: bool) -> None:
        allowed = (
            self.MECANUM_CONTROLS
            if self.drive_mode == "mecanum"
            else self.TRACKED_CONTROLS
        )
        if active and name not in allowed:
            return
        if active:
            self.controls.add(name)
        else:
            self.controls.discard(name)
        button = self.drive_buttons.get(name) or self.tracked_buttons.get(name)
        if button is not None:
            button.setProperty("active", active)
            button.style().unpolish(button)
            button.style().polish(button)
        if not active and not self.controls:
            self.stop_requested.emit("qt_motion_released")
        self.drive_changed.emit()

    def mecanum_target(self) -> tuple[int, int, int]:
        forward = int("forward" in self.controls) - int("backward" in self.controls)
        strafe = int("right" in self.controls) - int("left" in self.controls)
        turn = int("turn-right" in self.controls) - int("turn-left" in self.controls)
        scale = max(1, abs(forward) + abs(strafe) + abs(turn))
        return round(forward * 1000 / scale), round(strafe * 1000 / scale), round(turn * 1000 / scale)

    def tracked_target(self) -> tuple[int, int]:
        left = int("left-forward" in self.controls) - int("left-backward" in self.controls)
        right = int("right-forward" in self.controls) - int("right-backward" in self.controls)
        return left * 1000, right * 1000


class ManipulatorPage(QWidget):
    command = Signal(str, dict)

    def __init__(self) -> None:
        super().__init__()
        root = QVBoxLayout(self)
        root.setSpacing(18)
        root.addWidget(page_title("机械臂与夹爪", "逻辑坐标控制，不在PC端暴露舵机ID"))

        arm = QGroupBox("两连杆机械臂")
        arm_grid = QGridLayout(arm)
        self.motion_buttons: list[QPushButton] = []
        for text, axis, value, row, column in (
            ("上升", "z", 1, 0, 1),
            ("后缩", "x", -1, 1, 0),
            ("停止", "stop", 0, 1, 1),
            ("前伸", "x", 1, 1, 2),
            ("下降", "z", -1, 2, 1),
        ):
            button = QPushButton(text)
            button.setMinimumHeight(70)
            button.pressed.connect(lambda a=axis, v=value: self.command.emit("arm", {"axis": a, "value": v}))
            button.released.connect(lambda: self.command.emit("arm", {"axis": "stop", "value": 0}))
            self.motion_buttons.append(button)
            arm_grid.addWidget(button, row, column)

        claw = QGroupBox("腕部与夹爪")
        claw_grid = QGridLayout(claw)
        note = QLabel("上抬由控制器 ID13 控制；旋转范围 −180°～+180°，每次 10°")
        note.setWordWrap(True)
        claw_grid.addWidget(note, 0, 0, 1, 2)
        for column, (text, direction) in enumerate(
            (("左旋 10°", -1), ("右旋 10°", 1))
        ):
            button = QPushButton(text)
            button.setMinimumHeight(68)
            button.clicked.connect(
                lambda _checked=False, d=direction: self.command.emit(
                    "wrist", {"action": "rotate-step", "direction": d}
                )
            )
            self.motion_buttons.append(button)
            claw_grid.addWidget(button, 1, column)
        self.wrist_center_button = QPushButton("将 21/23 当前位置设为中点")
        self.wrist_center_button.setMinimumHeight(54)
        self.wrist_center_button.setToolTip(
            "先释放腕部并摆到物理起始姿态；点击后写入飞特舵机中点并保持扭矩释放"
        )
        self.wrist_center_button.clicked.connect(
            lambda _checked=False: self.command.emit("wrist-center", {})
        )
        claw_grid.addWidget(self.wrist_center_button, 2, 0, 1, 2)
        center_note = QLabel(
            "仅在 21/23 已静止、物理姿态摆正且控制器 ID13 位于起始位置时点击；"
            "完成后两只舵机应读回约 2048"
        )
        center_note.setWordWrap(True)
        center_note.setObjectName("muted")
        claw_grid.addWidget(center_note, 3, 0, 1, 2)
        for column, (text, value) in enumerate(
            (("张开", 1), ("闭合", -1))
        ):
            button = QPushButton(text)
            button.setMinimumHeight(68)
            button.pressed.connect(
                lambda v=value: self.command.emit(
                    "claw", {"axis": "grip", "value": v}
                )
            )
            button.released.connect(
                lambda: self.command.emit(
                    "claw", {"axis": "grip", "value": 0}
                )
            )
            self.motion_buttons.append(button)
            claw_grid.addWidget(button, 4, column)

        root.addWidget(arm)
        root.addWidget(claw)
        root.addStretch()

    def set_armed(self, armed: bool) -> None:
        pass


class CanPage(QWidget):
    command = Signal(str, dict)

    def __init__(self) -> None:
        super().__init__()
        root = QVBoxLayout(self)
        root.addWidget(page_title("CAN执行器", "四腿ASMG-MD前后逻辑步进"))
        settings = QGroupBox("步进参数")
        form = QFormLayout(settings)
        self.step = QSpinBox()
        self.step.setRange(1, 20)
        self.step.setValue(4)
        self.speed = QSpinBox()
        self.speed.setRange(0, 1280)
        self.speed.setValue(0)
        form.addRow("角度步进", self.step)
        form.addRow("速度参数", self.speed)
        root.addWidget(settings)

        groups = QGridLayout()
        self.motion_buttons: list[QPushButton] = []
        self.leg_groups: dict[str, QGroupBox] = {}
        self.leg_motion_buttons: dict[str, dict[str, QPushButton]] = {}
        for label, group, row, column in (
            ("左前腿", "front_left", 0, 0),
            ("右前腿", "front_right", 0, 1),
            ("左后腿", "rear_left", 1, 0),
            ("右后腿", "rear_right", 1, 1),
        ):
            box = QGroupBox(label)
            self.leg_groups[group] = box
            layout = QHBoxLayout(box)
            is_left = group.endswith("_left")
            minus = QPushButton("后" if is_left else "前")
            plus = QPushButton("前" if is_left else "后")
            read = QPushButton("读取状态")
            minus.clicked.connect(lambda _=False, g=group: self.send_jog(g, -1))
            plus.clicked.connect(lambda _=False, g=group: self.send_jog(g, 1))
            read.clicked.connect(lambda _=False, g=group: self.command.emit("can", {"action": "read", "group": g}))
            self.leg_motion_buttons[group] = {
                "front": plus if is_left else minus,
                "back": minus if is_left else plus,
            }
            self.motion_buttons.extend((minus, plus))
            layout.addWidget(minus)
            layout.addWidget(plus)
            layout.addWidget(read)
            groups.addWidget(box, row, column)
        root.addLayout(groups)
        root.addStretch()

    def set_armed(self, armed: bool) -> None:
        pass

    def send_jog(self, group: str, direction: int) -> None:
        self.command.emit(
            "can",
            {
                "action": "jog",
                "group": group,
                "direction": direction,
                "stepDeg": self.step.value(),
                "speedRaw": self.speed.value(),
            },
        )


class GimbalControl(QGroupBox):
    """Bounded position controls for Feetech ID4 pan and ID5 tilt."""

    command = Signal(dict)

    def __init__(self) -> None:
        super().__init__("云台控制")
        self.setObjectName("gimbalControl")
        self.setMaximumWidth(240)

        root = QVBoxLayout(self)
        hint = QLabel("ID4 左右 · ID5 上下\n按住方向键可连续微调")
        hint.setObjectName("muted")
        hint.setAlignment(Qt.AlignmentFlag.AlignCenter)
        root.addWidget(hint)

        pad = QGridLayout()
        self.motion_buttons: dict[str, QPushButton] = {}
        controls = (
            ("up", "▲", 0, 1, "tilt", 1),
            ("left", "◀", 1, 0, "pan", -1),
            ("right", "▶", 1, 2, "pan", 1),
            ("down", "▼", 2, 1, "tilt", -1),
        )
        for name, text, row, column, axis, direction in controls:
            button = QPushButton(text)
            button.setObjectName("gimbalButton")
            button.setMinimumSize(54, 48)
            button.setAutoRepeat(True)
            button.setAutoRepeatDelay(350)
            button.setAutoRepeatInterval(180)
            button.clicked.connect(
                lambda _=False, a=axis, d=direction: self.send_jog(a, d)
            )
            self.motion_buttons[name] = button
            pad.addWidget(button, row, column)

        self.center_button = QPushButton("●")
        self.center_button.setObjectName("gimbalCenterButton")
        self.center_button.setToolTip("云台回中")
        self.center_button.clicked.connect(
            lambda: self.command.emit({"action": "center"})
        )
        pad.addWidget(self.center_button, 1, 1)
        root.addLayout(pad)

        step_row = QHBoxLayout()
        step_row.addWidget(QLabel("单步"))
        self.step = QSpinBox()
        self.step.setRange(1, 15)
        self.step.setValue(5)
        self.step.setSuffix("°")
        step_row.addWidget(self.step)
        root.addLayout(step_row)

        self.feedback_status = QLabel("等待 ID4 / ID5 反馈")
        self.feedback_status.setObjectName("muted")
        self.feedback_status.setWordWrap(True)
        self.feedback_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        root.addWidget(self.feedback_status)
        root.addStretch()

    def send_jog(self, axis: str, direction: int) -> None:
        self.command.emit(
            {
                "action": "jog",
                "axis": axis,
                "direction": direction,
                "stepDeg": self.step.value(),
            }
        )

    def update_feedback(self, feedback: dict[str, Any]) -> None:
        pan = feedback.get("4") or {}
        tilt = feedback.get("5") or {}
        pan_raw = pan.get("positionRaw")
        tilt_raw = tilt.get("positionRaw")
        if isinstance(pan_raw, int) and isinstance(tilt_raw, int):
            self.feedback_status.setText(
                f"在线\nID4 左右 {pan_raw}\nID5 上下 {tilt_raw}"
            )
            self.feedback_status.setProperty("online", True)
        else:
            self.feedback_status.setText("等待 ID4 / ID5 反馈")
            self.feedback_status.setProperty("online", False)
        self.feedback_status.style().unpolish(self.feedback_status)
        self.feedback_status.style().polish(self.feedback_status)


class CameraPage(QWidget):
    """Single UGREEN camera view; the Pi owns capture, audio, and recovery."""

    command = Signal(str, dict)

    def __init__(self) -> None:
        super().__init__()
        self._network = QNetworkAccessManager(self)
        self._health_busy = False
        self._health_seen = False
        self._camera_online = False
        self._last_reconnect_count = -1

        root = QVBoxLayout(self)
        root.setSpacing(12)
        root.addWidget(page_title("主驾驶摄像头", "UGREEN · 1080p30 H.264 低延迟 · 现场声音"))

        status = QHBoxLayout()
        self.capture_status = QLabel("摄像头服务连接中")
        self.capture_status.setObjectName("cameraStatus")
        self.format_status = QLabel("1920×1080 · 等待 H.264 画面")
        self.format_status.setObjectName("muted")
        self.audio_status = QLabel("音频连接中")
        self.audio_status.setObjectName("muted")
        self.power_status = QLabel("电源状态未知")
        self.power_status.setObjectName("muted")
        refresh = QPushButton("重新连接")
        refresh.clicked.connect(self.reload)
        status.addWidget(self.capture_status)
        status.addWidget(self.format_status)
        status.addWidget(self.audio_status)
        status.addWidget(self.power_status)
        status.addStretch()
        status.addWidget(refresh)
        root.addLayout(status)

        content = QHBoxLayout()
        content.setSpacing(12)
        self.video_widget = QVideoWidget()
        self.video_widget.setObjectName("cameraView")
        self.video_widget.setAspectRatioMode(Qt.AspectRatioMode.KeepAspectRatio)
        self.video_player = QMediaPlayer(self)
        self.video_player.setVideoOutput(self.video_widget)
        self.video_player.errorOccurred.connect(
            lambda _error, message: self.capture_status.setText(
                f"视频播放器：{message or '连接中断'}"
            )
        )
        self.video_player.setSource(QUrl(f"{CAMERA_URL}/video.mp4"))
        self.video_player.play()
        content.addWidget(self.video_widget, 1)

        self.audio_view = QWebEngineView()
        self.audio_view.settings().setAttribute(
            QWebEngineSettings.WebAttribute.PlaybackRequiresUserGesture,
            False,
        )
        self.audio_view.setFixedHeight(1)
        self.audio_view.setMaximumWidth(1)
        self.audio_view.setUrl(QUrl(f"{CAMERA_URL}/view?audio-host=1"))
        self.gimbal_controls = GimbalControl()
        self.gimbal_controls.command.connect(
            lambda body: self.command.emit("gimbal", body)
        )
        content.addWidget(self.gimbal_controls)
        root.addLayout(content, 1)
        root.addWidget(self.audio_view)

        self.health_timer = QTimer(self)
        self.health_timer.setInterval(1000)
        self.health_timer.timeout.connect(self.refresh_health)
        self.health_timer.start()
        self.refresh_health()

    def reload(self) -> None:
        reload_token = int(time.time())
        self.video_player.stop()
        self.video_player.setSource(
            QUrl(f"{CAMERA_URL}/video.mp4?reload={reload_token}")
        )
        self.video_player.play()
        self.audio_view.setUrl(
            QUrl(f"{CAMERA_URL}/view?audio-host=1&reload={reload_token}")
        )
        self.refresh_health()

    def refresh_health(self) -> None:
        if self._health_busy:
            return
        self._health_busy = True
        request = QNetworkRequest(QUrl(f"{CAMERA_URL}/health"))
        request.setRawHeader(b"Cache-Control", b"no-store")
        reply = self._network.get(request)

        def finished() -> None:
            was_online = self._camera_online
            first_health = not self._health_seen
            self._health_seen = True
            try:
                raw = bytes(reply.readAll())
                payload = json.loads(raw or b"{}")
                self._camera_online = reply.error() == QNetworkReply.NoError and bool(payload.get("ok"))
                if self._camera_online:
                    degraded = bool(payload.get("degraded"))
                    reconnect_count = int(payload.get("reconnectCount") or 0)
                    self.capture_status.setText(
                        f"{'1080p20 降码率运行' if degraded else '1080p30 H.264 低延迟'} · 重连 {reconnect_count}"
                    )
                    self.capture_status.setProperty("online", True)
                    self.format_status.setText(
                        f"{payload.get('width', '--')}×{payload.get('height', '--')} · "
                        f"{float(payload.get('actualFps') or 0):.1f} FPS · "
                        f"{int(payload.get('actualBitrateKbps') or 0)} kbps · "
                        f"{payload.get('frameAgeMs', '--')} ms"
                    )
                    self.audio_status.setText(
                        "现场声音可用 · 48 kHz Opus"
                        if payload.get("audioAvailable")
                        else "现场声音不可用"
                    )
                    self.power_status.setText(
                        "检测到欠压记录" if payload.get("powerWarning") else "电源正常"
                    )
                    capture_restarted = (
                        self._last_reconnect_count >= 0
                        and reconnect_count != self._last_reconnect_count
                    )
                    self._last_reconnect_count = reconnect_count
                    if capture_restarted or (not was_online and not first_health):
                        self.reload()
                else:
                    self.capture_status.setText(str(payload.get("lastError") or "摄像头等待画面"))
                    self.capture_status.setProperty("online", False)
            except Exception:
                self._camera_online = False
                self.capture_status.setText("摄像头服务离线")
                self.capture_status.setProperty("online", False)
                self.format_status.setText("等待 192.168.55.131:8080")
                self.audio_status.setText("音频离线")
            finally:
                self.capture_status.style().unpolish(self.capture_status)
                self.capture_status.style().polish(self.capture_status)
                self._health_busy = False
                reply.deleteLater()

        reply.finished.connect(finished)

    def update_robot_health(self, health: dict[str, Any]) -> None:
        pi = health.get("pi") or {}
        feetech = pi.get("feetech") or {}
        feedback = feetech.get("feedback") or {}
        self.gimbal_controls.update_feedback(feedback)


class DevicesPage(QWidget):
    command = Signal(str, dict)

    def __init__(self) -> None:
        super().__init__()
        root = QVBoxLayout(self)
        root.addWidget(page_title("设备与遥测", "各产品独立在线状态"))
        cards = QGridLayout()
        self.cards = {
            "agent": StatusCard("PC Agent"),
            "pi": StatusCard("树莓派协调器"),
            "a-board": StatusCard("RoboMaster A板"),
            "controller": StatusCard("ESP32PLUS控制器"),
            "feetech": StatusCard("飞特舵机节点"),
            "imu": StatusCard("IMU"),
        }
        for index, card in enumerate(self.cards.values()):
            cards.addWidget(card, index // 3, index % 3)
        root.addLayout(cards)
        imu_button = QPushButton("读取IMU")
        imu_button.clicked.connect(lambda: self.command.emit("imu", {"action": "read"}))
        feetech_button = QPushButton("读取飞特舵机")
        feetech_button.clicked.connect(lambda: self.command.emit("feetech", {"action": "read"}))
        actions = QHBoxLayout()
        actions.addWidget(imu_button)
        actions.addWidget(feetech_button)
        root.addLayout(actions)
        self.raw = QPlainTextEdit()
        self.raw.setReadOnly(True)
        root.addWidget(self.raw, 1)

    def update_health(self, health: dict[str, Any]) -> None:
        pi = health.get("pi") or {}
        telemetry = pi.get("lastTelemetry") or {}
        self.cards["agent"].value.setText("在线" if health.get("ok") else "异常")
        self.cards["pi"].value.setText(pi.get("service", "离线"))
        self.cards["a-board"].value.setText("串口在线" if pi.get("serialOpen") else "串口离线")
        controller = health.get("controller") or {}
        self.cards["controller"].value.setText(
            "在线" if controller.get("connected") else controller.get("lastError", "未连接")
        )
        feetech = pi.get("feetech") or {}
        self.cards["feetech"].value.setText("串口在线" if feetech.get("serialOpen") else "串口离线")
        self.cards["imu"].value.setText(telemetry.get("type", "未读取"))
        self.raw.setPlainText(json.dumps(health, ensure_ascii=False, indent=2))


class SettingsPage(QWidget):
    def __init__(self) -> None:
        super().__init__()
        root = QVBoxLayout(self)
        root.addWidget(page_title("设置", "部署参数由各产品自己拥有"))
        box = QGroupBox("当前连接")
        form = QFormLayout(box)
        form.addRow("本地Agent", QLabel(AGENT_URL))
        form.addRow("控制周期", QLabel("50 Hz"))
        form.addRow("Pi看门狗", QLabel("150 ms"))
        form.addRow("Qt心跳看门狗", QLabel("300 ms"))
        form.addRow("物理上限", QLabel("100%（由当前档位约束）"))
        root.addWidget(box)
        note = QLabel("硬件引脚、CAN外设、串口路径和舵机ID不会进入Qt进程。")
        note.setWordWrap(True)
        note.setObjectName("muted")
        root.addWidget(note)
        root.addStretch()


class MainWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Rescue V2 控制站")
        self.resize(1280, 800)
        self.client = AgentClient()
        self.client.health_received.connect(self.update_health)
        self.client.error_received.connect(self.show_error)
        self.client.network_error_received.connect(self.show_network_error)
        self.client.armed_changed.connect(self.set_armed)
        self.client.operation_received.connect(self.show_operation)
        self._online = False
        self._restart_started = False
        self._network_error_active = False

        central = QWidget()
        self.setCentralWidget(central)
        shell = QHBoxLayout(central)
        shell.setContentsMargins(0, 0, 0, 0)
        shell.setSpacing(0)

        sidebar = QFrame()
        sidebar.setObjectName("sidebar")
        side = QVBoxLayout(sidebar)
        brand = QLabel("RESCUE\nV2")
        brand.setObjectName("brand")
        side.addWidget(brand)

        content = QWidget()
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(14, 10, 14, 14)
        content_layout.setSpacing(10)
        self.control_bar = GlobalControlBar()
        self.control_bar.stop_requested.connect(self.stop)
        self.control_bar.restart_requested.connect(self.restart_software)
        content_layout.addWidget(self.control_bar)

        self.stack = QStackedWidget()
        self.drive_page = DrivePage()
        self.manipulator_page = ManipulatorPage()
        self.can_page = CanPage()
        self.camera_page = CameraPage()
        self.devices_page = DevicesPage()
        self.settings_page = SettingsPage()
        pages = (
            ("整机操作", self.drive_page),
            ("机械臂", self.manipulator_page),
            ("CAN执行器", self.can_page),
            ("主摄像头", self.camera_page),
            ("设备遥测", self.devices_page),
            ("设置", self.settings_page),
        )
        group = QButtonGroup(self)
        group.setExclusive(True)
        for index, (name, page) in enumerate(pages):
            button = QPushButton(name)
            button.setCheckable(True)
            button.setObjectName("navButton")
            button.clicked.connect(lambda _=False, i=index: self.stack.setCurrentIndex(i))
            group.addButton(button)
            side.addWidget(button)
            self.stack.addWidget(page)
            if index == 0:
                button.setChecked(True)
        side.addStretch()
        version = QLabel("control-agent 0.1\nQt 6")
        version.setObjectName("muted")
        side.addWidget(version)
        shell.addWidget(sidebar)
        content_layout.addWidget(self.stack, 1)
        shell.addWidget(content, 1)

        self.drive_page.stop_requested.connect(self.stop)
        self.drive_page.speed_limits_changed.connect(self.client.speed_limits)
        self.manipulator_page.command.connect(self.client.capability)
        self.can_page.command.connect(self.client.capability)
        self.camera_page.command.connect(self.client.capability)
        self.devices_page.command.connect(self.client.capability)

        self.heartbeat_timer = QTimer(self)
        self.heartbeat_timer.setInterval(100)
        self.heartbeat_timer.timeout.connect(self.client.heartbeat)
        self.heartbeat_timer.start()
        self.health_timer = QTimer(self)
        self.health_timer.setInterval(500)
        self.health_timer.timeout.connect(self.client.health)
        self.health_timer.start()
        self.drive_timer = QTimer(self)
        self.drive_timer.setInterval(50)
        self.drive_timer.timeout.connect(self.send_motion)
        self.drive_timer.start()
        self.client.heartbeat()
        self.client.speed_limits(
            self.drive_page.mecanum_speed.value(),
            self.drive_page.tracked_speed.value(),
        )
        self.client.health()

    def keyPressEvent(self, event: QKeyEvent) -> None:
        if event.isAutoRepeat():
            return
        if event.key() == Qt.Key_L:
            self.drive_page.l_button_pressed()
        elif event.key() == Qt.Key_Space:
            self.stop("qt_space_emergency_stop")
        elif event.key() in DrivePage.KEY_MAP:
            self.drive_page.set_control(DrivePage.KEY_MAP[event.key()], True)
        else:
            super().keyPressEvent(event)

    def keyReleaseEvent(self, event: QKeyEvent) -> None:
        if event.isAutoRepeat():
            return
        if event.key() == Qt.Key_L:
            self.drive_page.l_button_released()
        elif event.key() in DrivePage.KEY_MAP:
            self.drive_page.set_control(DrivePage.KEY_MAP[event.key()], False)
        else:
            super().keyReleaseEvent(event)

    def closeEvent(self, event: QCloseEvent) -> None:
        self.client.stop("qt_window_closed")
        event.accept()

    def set_armed(self, armed: bool) -> None:
        self.drive_page.set_armed(armed)
        self.manipulator_page.set_armed(armed)
        self.can_page.set_armed(armed)
        self.control_bar.set_state(self._online, armed)

    def stop(self, reason: str) -> None:
        self.drive_page.controls.clear()
        self.client.stop(reason)

    def restart_software(self) -> None:
        if self._restart_started:
            return
        script = restart_script_path()
        if not script.exists():
            self.show_error(f"重启脚本不存在：{script}")
            return
        result = QProcess.startDetached(
            "powershell.exe",
            [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script),
            ],
            str(script.parent),
        )
        started = result[0] if isinstance(result, tuple) else bool(result)
        if not started:
            self.show_error("无法启动独立重启进程")
            return
        self._restart_started = True
        self.drive_page.controls.clear()
        self.control_bar.restart_button.setEnabled(False)
        self.control_bar.show_message("正在安全停止并重启 PC Agent 与 Qt…")
        application = QApplication.instance()
        if application is not None:
            QTimer.singleShot(250, application.quit)

    def send_motion(self) -> None:
        if not self.drive_page.controls:
            return
        if self.drive_page.drive_mode == "tracked":
            left, right = self.drive_page.tracked_target()
            if not (left or right):
                return
            self.client.capability(
                "tracked",
                {
                    "leftMilli": left,
                    "rightMilli": right,
                    "speedLimitPercent": self.drive_page.tracked_speed.value(),
                },
            )
            return
        forward, strafe, turn = self.drive_page.mecanum_target()
        if not (forward or strafe or turn):
            return
        self.client.drive(
            forward,
            strafe,
            turn,
            self.drive_page.mecanum_speed.value(),
        )

    def update_health(self, health: dict[str, Any]) -> None:
        pi = health.get("pi") or {}
        was_online = self._online
        self._online = bool(health.get("ok"))
        if self._online and self._network_error_active:
            self._network_error_active = False
            self.control_bar.show_message(
                "连接已恢复，无需解锁，按下运动按钮时自动建立控制通道"
            )
        if self._online and not was_online:
            self.control_bar.show_message("无需解锁，按下运动按钮时自动建立控制通道")
            self.client.speed_limits(
                self.drive_page.mecanum_speed.value(),
                self.drive_page.tracked_speed.value(),
            )
        self.drive_page.agent_card.value.setText("在线" if health.get("ok") else "异常")
        self.drive_page.pi_card.value.setText(pi.get("service", "离线"))
        self.drive_page.a_board_card.value.setText("串口在线" if pi.get("serialOpen") else "串口离线")
        self.set_armed(bool(health.get("armed")))
        self.camera_page.update_robot_health(health)
        self.devices_page.update_health(health)

    def show_error(self, message: str) -> None:
        self._network_error_active = False
        self.control_bar.show_message(f"操作失败：{message}", error=True)
        self.statusBar().showMessage(message, 5000)

    def show_network_error(self, message: str) -> None:
        self._network_error_active = True
        self.control_bar.show_message(f"连接异常：{message}", error=True)
        self.statusBar().showMessage(message, 3000)

    def show_operation(self, message: str) -> None:
        self._network_error_active = False
        self.control_bar.show_message(message)
        self.statusBar().showMessage(message, 3000)


def page_title(title: str, subtitle: str) -> QWidget:
    widget = QWidget()
    layout = QVBoxLayout(widget)
    layout.setContentsMargins(0, 0, 0, 0)
    heading = QLabel(title)
    heading.setObjectName("pageTitle")
    detail = QLabel(subtitle)
    detail.setObjectName("muted")
    layout.addWidget(heading)
    layout.addWidget(detail)
    return widget


STYLESHEET = """
QWidget {
  background: #0b1116;
  color: #edf4f7;
  font-family: "Segoe UI", "Microsoft YaHei";
  font-size: 14px;
}
#sidebar { background: #101920; min-width: 190px; max-width: 190px; border-right: 1px solid #263641; }
#brand { color: #54d9bd; font-size: 30px; font-weight: 900; padding: 22px 14px; letter-spacing: 3px; }
#navButton { text-align: left; padding: 14px 18px; border: 0; border-radius: 8px; background: transparent; }
#navButton:hover { background: #17252d; }
#navButton:checked { background: #174f48; color: #8ff4df; }
#pageTitle { font-size: 30px; font-weight: 800; }
#muted { color: #8da0aa; }
#statusCard { background: #111c23; border: 1px solid #293b46; border-radius: 12px; min-height: 82px; }
#statusValue { font-size: 16px; font-weight: 700; }
#cameraStatus { font-size: 15px; font-weight: 800; color: #ff8f96; }
#cameraStatus[online="true"] { color: #67e5c7; }
#cameraView { background: #020406; border: 1px solid #293b46; border-radius: 12px; }
#controlBar { background: #111c23; border: 1px solid #293b46; border-radius: 10px; }
#controlBar[armed="true"] { border-color: #3cbda3; }
#controlState { font-size: 16px; font-weight: 800; min-width: 110px; }
#muted[error="true"] { color: #ff8f96; }
QGroupBox { border: 1px solid #2b3e49; border-radius: 12px; margin-top: 12px; padding: 18px 12px 12px; font-weight: 700; }
QGroupBox::title { subcontrol-origin: margin; left: 12px; padding: 0 6px; color: #a9bbc4; }
QPushButton { background: #17242c; border: 1px solid #3b505c; border-radius: 9px; padding: 10px 16px; font-weight: 700; }
QPushButton:hover { border-color: #6d8794; }
QPushButton[active="true"] { background: #166858; border-color: #54d9bd; }
QPushButton#primary { background: #176b5b; border-color: #3cbda3; }
QPushButton#danger { background: #81272d; border-color: #d2575d; }
QPushButton#deadman { font-size: 19px; }
QSlider::groove:horizontal { height: 6px; background: #273943; border-radius: 3px; }
QSlider::handle:horizontal { width: 18px; margin: -6px 0; background: #54d9bd; border-radius: 9px; }
QSpinBox, QComboBox, QPlainTextEdit { background: #0a1014; border: 1px solid #324650; border-radius: 7px; padding: 7px; }
QStatusBar { background: #101920; color: #ffb2b6; }
"""


def main() -> int:
    application = QApplication(sys.argv)
    application.setStyle("Fusion")
    application.setStyleSheet(STYLESHEET)
    window = MainWindow()
    window.show()
    screen = application.primaryScreen()
    if screen is not None:
        available = screen.availableGeometry()
        frame = window.frameGeometry()
        frame.moveCenter(available.center())
        window.move(frame.topLeft())
    window.raise_()
    window.activateWindow()
    return application.exec()


if __name__ == "__main__":
    raise SystemExit(main())
