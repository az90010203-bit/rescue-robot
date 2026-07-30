import importlib.util
import os
import sys
import unittest
from pathlib import Path


os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

from PySide6.QtWidgets import QApplication, QPushButton


MODULE_PATH = (
    Path(__file__).parents[2]
    / "products"
    / "pc-station"
    / "qt"
    / "rescue_console.py"
)
SPEC = importlib.util.spec_from_file_location("rescue_console", MODULE_PATH)
assert SPEC and SPEC.loader
rescue_console = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = rescue_console
SPEC.loader.exec_module(rescue_console)


class QtConsoleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.application = QApplication.instance() or QApplication([])

    def test_global_control_bar_is_ready_without_unlock(self):
        bar = rescue_console.GlobalControlBar()

        bar.set_state(True, False)
        self.assertEqual(bar.state.text(), "控制就绪")
        self.assertFalse(hasattr(bar, "arm_button"))
        self.assertTrue(bar.stop_button.isEnabled())
        self.assertTrue(bar.restart_button.isEnabled())

    def test_agent_client_coalesces_health_and_heartbeat_requests(self):
        client = rescue_console.AgentClient()
        calls = []

        def fake_send(
            method,
            path,
            body,
            callback,
            *,
            quiet=False,
            accept_not_ok=False,
            settled=None,
        ):
            calls.append(
                {
                    "method": method,
                    "path": path,
                    "quiet": quiet,
                    "accept_not_ok": accept_not_ok,
                    "settled": settled,
                }
            )

        client._send = fake_send
        client.health()
        client.health()
        client.heartbeat()
        client.heartbeat()

        self.assertEqual(
            [call["path"] for call in calls],
            ["/v2/health", "/v2/ui/heartbeat"],
        )
        self.assertTrue(calls[0]["accept_not_ok"])
        self.assertFalse(calls[1]["accept_not_ok"])
        calls[0]["settled"]()
        calls[1]["settled"]()
        client.health()
        client.heartbeat()
        self.assertEqual(len(calls), 4)

    def test_global_control_bar_requests_one_click_software_restart(self):
        bar = rescue_console.GlobalControlBar()
        requests = []
        bar.restart_requested.connect(lambda: requests.append(True))

        bar.restart_button.click()

        self.assertEqual(requests, [True])

    def test_restart_helper_is_external_and_stops_before_relaunch(self):
        script = rescue_console.restart_script_path()
        source = script.read_text(encoding="utf-8-sig")

        self.assertTrue(script.exists())
        self.assertIn("ui_software_restart", source)
        self.assertIn("rescue_agent.py", source)
        self.assertIn("rescue_console.py", source)
        self.assertLess(
            source.index("/v2/control/stop"),
            source.index("Stop-Process"),
        )
        self.assertLess(
            source.index("Stop-Process"),
            source.rindex("Start-Process"),
        )

    def test_manipulator_motion_buttons_are_available_without_unlock(self):
        page = rescue_console.ManipulatorPage()
        self.assertTrue(page.motion_buttons)
        self.assertTrue(all(button.isEnabled() for button in page.motion_buttons))

    def test_gimbal_pad_emits_pan_tilt_and_center_commands(self):
        pad = rescue_console.GimbalControl()
        commands = []
        pad.command.connect(commands.append)
        pad.step.setValue(5)

        pad.motion_buttons["left"].click()
        pad.motion_buttons["up"].click()
        pad.center_button.click()

        self.assertEqual(
            commands,
            [
                {
                    "action": "jog",
                    "axis": "pan",
                    "direction": -1,
                    "stepDeg": 5,
                },
                {
                    "action": "jog",
                    "axis": "tilt",
                    "direction": 1,
                    "stepDeg": 5,
                },
                {"action": "center"},
            ],
        )

    def test_gimbal_feedback_labels_id4_pan_and_id5_tilt(self):
        pad = rescue_console.GimbalControl()

        pad.update_feedback(
            {
                "4": {"positionRaw": 2049},
                "5": {"positionRaw": 2052},
            }
        )

        self.assertIn("ID4 左右 2049", pad.feedback_status.text())
        self.assertIn("ID5 上下 2052", pad.feedback_status.text())

    def test_camera_uses_qt_multimedia_h264_feed(self):
        source = MODULE_PATH.read_text(encoding="utf-8")

        self.assertIn("QMediaPlayer", source)
        self.assertIn("QVideoWidget", source)
        self.assertIn("/video.mp4", source)
        self.assertIn("audio-host=1", source)

    def test_wrist_center_button_sets_both_feetech_centers(self):
        page = rescue_console.ManipulatorPage()
        commands = []
        page.command.connect(
            lambda capability, body: commands.append((capability, body))
        )

        self.assertEqual(
            page.wrist_center_button.text(),
            "将 21/23 当前位置设为中点",
        )
        page.wrist_center_button.click()

        self.assertEqual(commands, [("wrist-center", {})])

    def test_drive_has_no_manual_enable_and_stops_on_release(self):
        page = rescue_console.DrivePage()
        stops = []
        page.stop_requested.connect(stops.append)
        self.assertFalse(
            any("使能" in button.text() for button in page.findChildren(QPushButton))
        )

        page.set_control("forward", True)
        page.set_control("forward", False)

        self.assertEqual(stops, ["qt_motion_released"])

    def test_mecanum_and_tracked_speed_ranges_are_independent(self):
        page = rescue_console.DrivePage()
        changes = []
        page.speed_limits_changed.connect(
            lambda mecanum, tracked: changes.append((mecanum, tracked))
        )

        self.assertEqual((page.mecanum_speed.minimum(), page.mecanum_speed.maximum()), (30, 70))
        self.assertEqual((page.tracked_speed.minimum(), page.tracked_speed.maximum()), (30, 100))
        self.assertEqual((page.mecanum_speed.value(), page.tracked_speed.value()), (50, 60))

        page.tracked_speed.setValue(85)
        self.assertEqual(changes[-1], (50, 85))

    def test_l_button_switches_mecanum_and_tracked_modes_with_stop(self):
        page = rescue_console.DrivePage()
        stops = []
        page.stop_requested.connect(stops.append)

        self.assertEqual(page.drive_mode, "mecanum")
        self.assertEqual(
            page.mode_button.text(),
            "L：麦轮 | TURBO MODE · 50%",
        )
        self.assertTrue(page.mecanum_group.isEnabled())
        self.assertFalse(page.tracked_group.isEnabled())

        page.set_control("forward", True)
        page.mode_button.click()

        self.assertEqual(page.drive_mode, "tracked")
        self.assertEqual(
            page.mode_button.text(),
            "L：履带 | TURBO MODE · 60%",
        )
        self.assertFalse(page.mecanum_group.isEnabled())
        self.assertTrue(page.tracked_group.isEnabled())
        self.assertEqual(page.controls, set())
        self.assertEqual(stops, ["qt_drive_mode_changed"])

        page.mode_button.click()
        self.assertEqual(page.drive_mode, "mecanum")
        self.assertEqual(stops[-1], "qt_drive_mode_changed")

    def test_l_long_press_cycles_named_speed_levels(self):
        page = rescue_console.DrivePage()
        changes = []
        page.speed_limits_changed.connect(
            lambda mecanum, tracked: changes.append((mecanum, tracked))
        )

        page.activate_l_button(0.7)

        self.assertEqual(page.speed_level, 2)
        self.assertEqual(
            (page.mecanum_speed.value(), page.tracked_speed.value()),
            (70, 100),
        )
        self.assertEqual(
            page.mode_button.text(),
            "L：麦轮 | HYPER MODE · 70%",
        )
        self.assertEqual(changes, [(70, 100)])

        page.activate_l_button(1.0)
        self.assertEqual(page.speed_level, 0)
        self.assertEqual(
            (page.mecanum_speed.value(), page.tracked_speed.value()),
            (30, 30),
        )
        self.assertEqual(
            page.mode_button.text(),
            "L：麦轮 | CRUISE MODE · 30%",
        )

    def test_manual_speed_pair_is_reported_as_custom_mode(self):
        page = rescue_console.DrivePage()

        page.mecanum_speed.setValue(45)

        self.assertIsNone(page.speed_level)
        self.assertEqual(
            page.mode_button.text(),
            "L：麦轮 | CUSTOM MODE · 45%",
        )

        page.activate_l_button(0.7)
        self.assertEqual(page.speed_level, 0)
        self.assertEqual(
            (page.mecanum_speed.value(), page.tracked_speed.value()),
            (30, 30),
        )

    def test_drive_mode_ignores_controls_from_inactive_chassis(self):
        page = rescue_console.DrivePage()

        page.set_control("left-forward", True)
        self.assertEqual(page.controls, set())

        page.toggle_drive_mode()
        page.set_control("forward", True)
        self.assertEqual(page.controls, set())
        page.set_control("left-forward", True)
        self.assertEqual(page.tracked_target(), (1000, 0))

    def test_can_read_and_jog_are_available_without_unlock(self):
        page = rescue_console.CanPage()
        read_buttons = [
            button for button in page.findChildren(QPushButton) if button.text() == "读取状态"
        ]
        self.assertEqual(len(read_buttons), 4)
        self.assertTrue(all(button.isEnabled() for button in read_buttons))
        self.assertTrue(all(button.isEnabled() for button in page.motion_buttons))

    def test_can_page_exposes_four_independent_legs(self):
        page = rescue_console.CanPage()

        self.assertEqual(
            set(page.leg_groups),
            {"front_left", "front_right", "rear_left", "rear_right"},
        )
        self.assertEqual(
            {box.title() for box in page.leg_groups.values()},
            {"左前腿", "右前腿", "左后腿", "右后腿"},
        )

    def test_can_leg_buttons_map_front_and_back_by_installed_side(self):
        page = rescue_console.CanPage()
        commands = []
        page.command.connect(
            lambda capability, body: commands.append((capability, body))
        )

        expected_directions = {
            "front_left": {"front": 1, "back": -1},
            "rear_left": {"front": 1, "back": -1},
            "front_right": {"front": -1, "back": 1},
            "rear_right": {"front": -1, "back": 1},
        }
        for group, directions in expected_directions.items():
            for motion, direction in directions.items():
                button = page.leg_motion_buttons[group][motion]
                self.assertEqual(button.text(), "前" if motion == "front" else "后")
                button.click()
                self.assertEqual(commands[-1][0], "can")
                self.assertEqual(commands[-1][1]["group"], group)
                self.assertEqual(commands[-1][1]["direction"], direction)


if __name__ == "__main__":
    unittest.main()
