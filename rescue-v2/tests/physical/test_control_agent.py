import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[2] / "products" / "pc-station" / "agent" / "rescue_agent.py"
SPEC = importlib.util.spec_from_file_location("rescue_agent", MODULE_PATH)
assert SPEC and SPEC.loader
rescue_agent = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = rescue_agent
SPEC.loader.exec_module(rescue_agent)


class Clock:
    def __init__(self):
        self.now = 1.0

    def __call__(self):
        return self.now


class FakePi:
    def __init__(self):
        self.posts = []
        self.armed = False
        self.fail_keepalive = False

    def get(self, path):
        return {"ok": True, "service": "fake-pi", "armed": self.armed}

    def post(self, path, body):
        self.posts.append((path, body))
        if path.endswith("/arm"):
            self.armed = True
            return {"ok": True, "leaseToken": "lease-1"}
        if path.endswith("/stop"):
            self.armed = False
        if path.endswith("/keepalive") and self.fail_keepalive:
            self.armed = False
            raise rescue_agent.AgentError("control lease is not armed")
        return {"ok": True}


class ActiveController:
    def __init__(self):
        self.frame = {
            "type": "xiao_drive_controller",
            "mode": "mecanum",
            "forward": 0.5,
            "strafe": 0,
            "turn": 0,
            "frontLeg": 0,
            "frontLegRaw": rescue_agent.FRONT_LEG_SOURCE_CENTER_RAW,
            "frontLegReady": True,
            "rearLeg": 0,
            "rearLegRaw": rescue_agent.REAR_LEG_SOURCE_CENTER_RAW,
            "rearLegReady": True,
            "armJ1": -1,
            "armJ1Raw": 3077,
            "armJ1Ready": True,
            "armJ2": -1,
            "armJ2Raw": 874,
            "armJ2Ready": True,
            "wristLift": -1,
            "wristLiftRaw": 3006,
            "wristLiftReady": True,
        }

    def current(self):
        return dict(self.frame)

    def snapshot(self):
        return {"connected": True}

    def center(self):
        self.frame.update({"forward": 0, "strafe": 0, "turn": 0})

    def activate(self):
        self.frame.update({"forward": 0.5, "strafe": 0, "turn": 0})

    def activate_front_leg(self, value):
        self.center()
        self.frame["frontLeg"] = value
        self.frame["frontLegRaw"] = (
            rescue_agent.FRONT_LEG_SOURCE_CENTER_RAW
            + round(value * 608)
        )

    def center_front_leg(self):
        self.frame["frontLeg"] = 0
        self.frame["frontLegRaw"] = rescue_agent.FRONT_LEG_SOURCE_CENTER_RAW

    def activate_rear_leg(self, value):
        self.center()
        self.frame["rearLeg"] = value
        self.frame["rearLegRaw"] = (
            rescue_agent.REAR_LEG_SOURCE_CENTER_RAW
            + round(value * 608)
        )

    def center_rear_leg(self):
        self.frame["rearLeg"] = 0
        self.frame["rearLegRaw"] = rescue_agent.REAR_LEG_SOURCE_CENTER_RAW

    def activate_arm_j1(self, value):
        self.center()
        self.center_front_leg()
        self.center_rear_leg()
        self.frame["armJ1"] = value
        self.frame["armJ1Raw"] = 3128 if value < 0 else 961

    def center_arm_j1(self):
        self.frame["armJ1"] = 0
        self.frame["armJ1Raw"] = 1995

    def park_arm_j1(self):
        self.frame["armJ1"] = -1
        self.frame["armJ1Raw"] = 3077

    def activate_arm_j2(self, value):
        self.center()
        self.center_front_leg()
        self.center_rear_leg()
        self.park_arm_j1()
        self.frame["armJ2"] = value
        self.frame["armJ2Raw"] = 874 if value < 0 else 2935

    def center_arm_j2(self):
        self.frame["armJ2"] = 0
        self.frame["armJ2Raw"] = 1941

    def park_arm_j2(self):
        self.frame["armJ2"] = -1
        self.frame["armJ2Raw"] = 874

    def activate_wrist_lift(self, value):
        self.center()
        self.center_front_leg()
        self.center_rear_leg()
        self.park_arm_j1()
        self.park_arm_j2()
        self.frame["wristLift"] = value
        self.frame["wristLiftRaw"] = 2500

    def park_wrist_lift(self):
        self.frame["wristLift"] = -1
        self.frame["wristLiftRaw"] = 3006


class ControlAgentTests(unittest.TestCase):
    def test_local_agent_handler_supports_http11_keep_alive(self):
        handler = rescue_agent.create_handler(
            rescue_agent.ControlAgent(FakePi(), Clock())
        )

        self.assertEqual(handler.protocol_version, "HTTP/1.1")

    def test_controller_axis_mapping_enforces_thirty_percent_start(self):
        mode, forward, strafe, turn = rescue_agent.map_controller_axes(
            {"type": "dual_knob_mecanum", "forward": 0.2, "strafe": 0, "turn": 0},
            100,
        )
        self.assertEqual(mode, "mecanum")
        self.assertGreaterEqual(abs(forward) * 70 / 1000, 30)
        self.assertEqual((strafe, turn), (0, 0))

    def test_drive_speed_limits_are_independent_and_bounded(self):
        clock = Clock()
        pi = FakePi()
        agent = rescue_agent.ControlAgent(pi, clock)

        result = agent.set_speed_limits(
            {"mecanumPercent": 45, "trackedPercent": 80}
        )

        self.assertEqual(result["speedLimits"], {"mecanum": 45, "tracked": 80})
        self.assertEqual(agent.health()["speedLimits"], {"mecanum": 45, "tracked": 80})
        with self.assertRaises(ValueError):
            agent.set_speed_limits({"mecanumPercent": 29, "trackedPercent": 80})
        with self.assertRaises(ValueError):
            agent.set_speed_limits({"mecanumPercent": 71, "trackedPercent": 80})
        with self.assertRaises(ValueError):
            agent.set_speed_limits({"mecanumPercent": 45, "trackedPercent": 101})

    def test_controller_speed_levels_are_mode_specific(self):
        self.assertEqual(
            [
                rescue_agent.controller_speed_limit_percent(
                    {"speedLevel": level},
                    "mecanum",
                    50,
                )
                for level in (1, 2, 3)
            ],
            [30, 50, 70],
        )
        self.assertEqual(
            [
                rescue_agent.controller_speed_limit_percent(
                    {"speedLevel": level},
                    "tracked",
                    60,
                )
                for level in (1, 2, 3)
            ],
            [30, 60, 100],
        )
        self.assertEqual(
            rescue_agent.controller_speed_limit_percent({}, "mecanum", 45),
            45,
        )

    def test_front_leg_mapping_requires_ready_and_deadband(self):
        self.assertEqual(
            rescue_agent.map_front_leg_direction(
                {"frontLegReady": True, "frontLeg": 0.5}
            ),
            1,
        )
        self.assertEqual(
            rescue_agent.map_front_leg_direction(
                {"frontLegReady": True, "frontLeg": -0.5}
            ),
            -1,
        )
        self.assertEqual(
            rescue_agent.map_front_leg_direction(
                {"frontLegReady": True, "frontLeg": 0.1}
            ),
            0,
        )
        self.assertEqual(
            rescue_agent.map_front_leg_direction(
                {"frontLegReady": False, "frontLeg": 1}
            ),
            0,
        )

    def test_front_leg_pose_mapping_preserves_physical_angle(self):
        self.assertEqual(
            rescue_agent.map_front_leg_pose_milli_degrees(
                {
                    "frontLegReady": True,
                    "frontLegRaw": rescue_agent.FRONT_LEG_SOURCE_CENTER_RAW,
                }
            ),
            180_000,
        )
        self.assertEqual(
            rescue_agent.map_front_leg_pose_milli_degrees(
                {"frontLegReady": True, "frontLegRaw": 1869}
            ),
            233_438,
        )
        self.assertEqual(
            rescue_agent.map_front_leg_pose_milli_degrees(
                {"frontLegReady": True, "frontLegRaw": 747}
            ),
            134_824,
        )
        self.assertIsNone(
            rescue_agent.map_front_leg_pose_milli_degrees(
                {"frontLegReady": False, "frontLegRaw": 1869}
            )
        )

    def test_rear_leg_pose_mapping_uses_id16_center_and_wraps(self):
        self.assertEqual(
            rescue_agent.map_rear_leg_pose_milli_degrees(
                {
                    "rearLegReady": True,
                    "rearLegRaw": rescue_agent.REAR_LEG_SOURCE_CENTER_RAW,
                }
            ),
            180_000,
        )
        self.assertEqual(
            rescue_agent.map_rear_leg_pose_milli_degrees(
                {"rearLegReady": True, "rearLegRaw": 3602}
            ),
            233_438,
        )
        self.assertEqual(
            rescue_agent.map_rear_leg_pose_milli_degrees(
                {"rearLegReady": True, "rearLegRaw": 290}
            ),
            302_344,
        )

    def test_arm_j1_mapping_requires_ready_and_preserves_sign(self):
        self.assertEqual(
            rescue_agent.map_arm_j1_unit_milli(
                {"armJ1Ready": True, "armJ1": -1.0}
            ),
            -1000,
        )
        self.assertEqual(
            rescue_agent.map_arm_j1_unit_milli(
                {"armJ1Ready": True, "armJ1": 0.5}
            ),
            500,
        )
        self.assertEqual(
            rescue_agent.map_arm_j1_unit_milli(
                {"armJ1Ready": True, "armJ1": 0.01}
            ),
            0,
        )
        self.assertIsNone(
            rescue_agent.map_arm_j1_unit_milli(
                {"armJ1Ready": False, "armJ1": 1.0}
            )
        )

    def test_arm_j2_mapping_requires_ready_and_preserves_sign(self):
        self.assertEqual(
            rescue_agent.map_arm_j2_unit_milli(
                {"armJ2Ready": True, "armJ2": -1.0}
            ),
            -1000,
        )
        self.assertEqual(
            rescue_agent.map_arm_j2_unit_milli(
                {"armJ2Ready": True, "armJ2": 0.5}
            ),
            500,
        )
        self.assertIsNone(
            rescue_agent.map_arm_j2_unit_milli(
                {"armJ2Ready": False, "armJ2": 1.0}
            )
        )

    def test_wrist_lift_mapping_requires_ready_and_preserves_sign(self):
        self.assertEqual(
            rescue_agent.map_wrist_lift_unit_milli(
                {"wristLiftReady": True, "wristLift": -0.5}
            ),
            -500,
        )
        self.assertIsNone(
            rescue_agent.map_wrist_lift_unit_milli(
                {"wristLiftReady": False, "wristLift": 1.0}
            )
        )

    def test_agent_injects_lease_and_sequence(self):
        clock = Clock()
        pi = FakePi()
        agent = rescue_agent.ControlAgent(pi, clock)
        agent.heartbeat()
        agent.arm()
        agent.drive(
            {
                "forwardMilli": 500,
                "strafeMilli": 0,
                "turnMilli": -100,
                "speedLimitPercent": 30,
                "deadman": True,
            }
        )
        path, command = pi.posts[-1]
        self.assertEqual(path, "/v2/control/drive")
        self.assertEqual(command["leaseToken"], "lease-1")
        self.assertEqual(command["sequence"], 1)

    def test_drive_auto_arms_when_qt_heartbeat_is_fresh(self):
        clock = Clock()
        pi = FakePi()
        agent = rescue_agent.ControlAgent(pi, clock)
        agent.heartbeat()

        agent.drive(
            {
                "forwardMilli": 0,
                "strafeMilli": 0,
                "turnMilli": 0,
                "speedLimitPercent": 30,
                "deadman": True,
            }
        )

        self.assertEqual(pi.posts[0], ("/v2/control/arm", {}))
        self.assertEqual(pi.posts[1][0], "/v2/control/drive")
        self.assertEqual(pi.posts[1][1]["leaseToken"], "lease-1")

    def test_motion_capability_auto_arms(self):
        clock = Clock()
        pi = FakePi()
        agent = rescue_agent.ControlAgent(pi, clock)
        agent.heartbeat()

        agent.capability("arm", {"axis": "stop", "value": 0})

        self.assertEqual(pi.posts[0], ("/v2/control/arm", {}))
        self.assertEqual(pi.posts[1][0], "/v2/control/arm-jog")

    def test_gimbal_capability_forwards_bounded_position_command(self):
        clock = Clock()
        pi = FakePi()
        agent = rescue_agent.ControlAgent(pi, clock)
        agent.heartbeat()

        agent.capability(
            "gimbal",
            {
                "action": "jog",
                "axis": "pan",
                "direction": 1,
                "stepDeg": 5,
            },
        )

        self.assertEqual(pi.posts[0], ("/v2/control/arm", {}))
        self.assertEqual(pi.posts[1][0], "/v2/control/gimbal-jog")
        self.assertEqual(pi.posts[1][1]["axis"], "pan")
        self.assertEqual(pi.posts[1][1]["leaseToken"], "lease-1")

    def test_ui_tracked_command_yields_to_active_esp32plus(self):
        clock = Clock()
        pi = FakePi()
        controller = ActiveController()
        agent = rescue_agent.ControlAgent(pi, clock, controller=controller)
        agent.heartbeat()

        result = agent.capability(
            "tracked",
            {
                "leftMilli": 1000,
                "rightMilli": 1000,
                "speedLimitPercent": 60,
            },
        )

        self.assertEqual(
            result,
            {
                "ok": True,
                "accepted": False,
                "reason": "esp32plus_has_priority",
            },
        )
        self.assertEqual(pi.posts, [])

    def test_wrist_center_capability_forwards_to_hardware_calibration(self):
        clock = Clock()
        pi = FakePi()
        agent = rescue_agent.ControlAgent(pi, clock)
        agent.heartbeat()

        agent.capability("wrist-center", {})

        self.assertEqual(pi.posts[0], ("/v2/control/arm", {}))
        self.assertEqual(
            pi.posts[1],
            (
                "/v2/control/wrist-calibrate-center",
                {"sequence": 1, "leaseToken": "lease-1"},
            ),
        )

    def test_wrist_center_requires_controller_id13_start_position(self):
        clock = Clock()
        pi = FakePi()
        controller = ActiveController()
        controller.activate_wrist_lift(-0.5)
        agent = rescue_agent.ControlAgent(pi, clock, controller=controller)
        agent.heartbeat()

        with self.assertRaisesRegex(
            rescue_agent.AgentError,
            "ID13",
        ):
            agent.capability("wrist-center", {})

        self.assertEqual(pi.posts, [])

    def test_controller_cannot_auto_arm_from_idle(self):
        clock = Clock()
        pi = FakePi()
        agent = rescue_agent.ControlAgent(pi, clock, controller=ActiveController())
        agent.heartbeat()

        agent.watchdog_step()

        self.assertEqual(pi.posts, [])
        self.assertFalse(agent.health()["armed"])

    def test_controller_auto_arms_after_stable_center_and_deliberate_input(self):
        clock = Clock()
        pi = FakePi()
        controller = ActiveController()
        controller.center()
        agent = rescue_agent.ControlAgent(pi, clock, controller=controller)
        agent.heartbeat()
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_CENTER_SECONDS + 0.001
        agent.heartbeat()
        agent.watchdog_step()

        controller.activate()
        agent.watchdog_step()
        self.assertEqual(pi.posts, [])
        clock.now += rescue_agent.CONTROLLER_ACTIVE_DEBOUNCE_SECONDS + 0.001
        agent.watchdog_step()

        self.assertEqual(pi.posts[0], ("/v2/control/arm", {}))
        self.assertEqual(pi.posts[1][0], "/v2/control/drive")
        self.assertEqual(
            pi.posts[1][1]["speedLimitPercent"],
            rescue_agent.DEFAULT_MECANUM_SPEED_PERCENT,
        )

    def test_controller_uses_configured_tracked_speed_limit(self):
        clock = Clock()
        pi = FakePi()
        controller = ActiveController()
        controller.center()
        controller.frame["mode"] = "tracked"
        agent = rescue_agent.ControlAgent(pi, clock, controller=controller)
        agent.set_speed_limits({"mecanumPercent": 45, "trackedPercent": 85})
        agent.heartbeat()
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_CENTER_SECONDS + 0.001
        agent.heartbeat()
        agent.watchdog_step()

        controller.activate()
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_ACTIVE_DEBOUNCE_SECONDS + 0.001
        agent.watchdog_step()

        self.assertEqual(pi.posts[1][0], "/v2/control/tracked")
        self.assertEqual(pi.posts[1][1]["speedLimitPercent"], 85)

    def test_controller_speed_level_overrides_configured_limit(self):
        clock = Clock()
        pi = FakePi()
        controller = ActiveController()
        controller.center()
        controller.frame["mode"] = "tracked"
        controller.frame["speedLevel"] = 3
        agent = rescue_agent.ControlAgent(pi, clock, controller=controller)
        agent.set_speed_limits({"mecanumPercent": 45, "trackedPercent": 60})
        agent.heartbeat()
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_CENTER_SECONDS + 0.001
        agent.heartbeat()
        agent.watchdog_step()

        controller.activate()
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_ACTIVE_DEBOUNCE_SECONDS + 0.001
        agent.watchdog_step()

        self.assertEqual(pi.posts[1][0], "/v2/control/tracked")
        self.assertEqual(pi.posts[1][1]["speedLimitPercent"], 100)

    def test_front_leg_input_auto_arms_and_sends_absolute_pair_pose(self):
        clock = Clock()
        pi = FakePi()
        controller = ActiveController()
        controller.center()
        controller.center_front_leg()
        agent = rescue_agent.ControlAgent(pi, clock, controller=controller)
        agent.heartbeat()
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_CENTER_SECONDS + 0.001
        agent.heartbeat()
        agent.watchdog_step()

        controller.activate_front_leg(1.0)
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_ACTIVE_DEBOUNCE_SECONDS + 0.001
        agent.watchdog_step()

        self.assertEqual(pi.posts[0], ("/v2/control/arm", {}))
        path, command = pi.posts[1]
        self.assertEqual(path, "/v2/control/can-pose")
        self.assertEqual(command["group"], "front")
        self.assertEqual(command["angleMilliDeg"], 233_438)
        self.assertEqual(command["speedRaw"], 0)

        controller.center_front_leg()
        agent.watchdog_step()
        self.assertEqual(pi.posts[-1][0], "/v2/control/can-pose")
        self.assertEqual(pi.posts[-1][1]["angleMilliDeg"], 180_000)

    def test_rear_leg_input_maps_id16_to_rear_absolute_pair_pose(self):
        clock = Clock()
        pi = FakePi()
        controller = ActiveController()
        controller.center()
        controller.center_front_leg()
        controller.center_rear_leg()
        agent = rescue_agent.ControlAgent(pi, clock, controller=controller)
        agent.heartbeat()
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_CENTER_SECONDS + 0.001
        agent.heartbeat()
        agent.watchdog_step()

        controller.activate_rear_leg(1.0)
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_ACTIVE_DEBOUNCE_SECONDS + 0.001
        agent.watchdog_step()

        self.assertEqual(pi.posts[0], ("/v2/control/arm", {}))
        path, command = pi.posts[1]
        self.assertEqual(path, "/v2/control/can-pose")
        self.assertEqual(command["group"], "rear")
        self.assertEqual(command["angleMilliDeg"], 233_438)
        self.assertEqual(command["speedRaw"], 0)

    def test_id11_maps_to_id9_absolute_arm_pose(self):
        clock = Clock()
        pi = FakePi()
        controller = ActiveController()
        controller.center()
        controller.center_front_leg()
        controller.center_rear_leg()
        controller.park_arm_j1()
        controller.park_arm_j2()
        agent = rescue_agent.ControlAgent(pi, clock, controller=controller)
        agent.heartbeat()
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_CENTER_SECONDS + 0.001
        agent.heartbeat()
        agent.watchdog_step()

        controller.activate_arm_j1(-0.5)
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_ACTIVE_DEBOUNCE_SECONDS + 0.001
        agent.watchdog_step()

        self.assertEqual(pi.posts[0], ("/v2/control/arm", {}))
        path, command = pi.posts[1]
        self.assertEqual(path, "/v2/control/arm-pose")
        self.assertEqual(command["joint"], "j1")
        self.assertEqual(command["unitMilli"], -500)

        controller.park_arm_j1()
        agent.watchdog_step()
        self.assertEqual(pi.posts[-1][0], "/v2/control/arm-pose")
        self.assertEqual(pi.posts[-1][1]["unitMilli"], -1000)

    def test_id12_maps_to_id10_absolute_arm_pose(self):
        clock = Clock()
        pi = FakePi()
        controller = ActiveController()
        controller.center()
        controller.center_front_leg()
        controller.center_rear_leg()
        controller.park_arm_j1()
        controller.park_arm_j2()
        agent = rescue_agent.ControlAgent(pi, clock, controller=controller)
        agent.heartbeat()
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_CENTER_SECONDS + 0.001
        agent.heartbeat()
        agent.watchdog_step()

        controller.activate_arm_j2(-0.5)
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_ACTIVE_DEBOUNCE_SECONDS + 0.001
        agent.watchdog_step()

        self.assertEqual(pi.posts[0], ("/v2/control/arm", {}))
        path, command = pi.posts[1]
        self.assertEqual(path, "/v2/control/arm-pose")
        self.assertEqual(command["joint"], "j2")
        self.assertEqual(command["unitMilli"], -500)

        controller.park_arm_j2()
        agent.watchdog_step()
        self.assertEqual(pi.posts[-1][0], "/v2/control/arm-pose")
        self.assertEqual(pi.posts[-1][1]["joint"], "j2")
        self.assertEqual(pi.posts[-1][1]["unitMilli"], -1000)

    def test_id13_maps_to_differential_wrist_lift_pose(self):
        clock = Clock()
        pi = FakePi()
        controller = ActiveController()
        controller.center()
        controller.park_arm_j1()
        controller.park_arm_j2()
        controller.park_wrist_lift()
        agent = rescue_agent.ControlAgent(pi, clock, controller=controller)
        agent.heartbeat()
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_CENTER_SECONDS + 0.001
        agent.heartbeat()
        agent.watchdog_step()

        controller.activate_wrist_lift(-0.5)
        agent.watchdog_step()
        clock.now += rescue_agent.CONTROLLER_ACTIVE_DEBOUNCE_SECONDS + 0.001
        agent.watchdog_step()

        self.assertEqual(pi.posts[0], ("/v2/control/arm", {}))
        path, command = pi.posts[1]
        self.assertEqual(path, "/v2/control/wrist-pose")
        self.assertEqual(command["action"], "lift")
        self.assertEqual(command["liftUnitMilli"], -500)

        controller.park_wrist_lift()
        agent.watchdog_step()
        self.assertEqual(pi.posts[-1][0], "/v2/control/wrist-pose")
        self.assertEqual(pi.posts[-1][1]["liftUnitMilli"], -1000)

    def test_stale_qt_heartbeat_stops_and_releases_lease(self):
        clock = Clock()
        pi = FakePi()
        agent = rescue_agent.ControlAgent(pi, clock)
        agent.heartbeat()
        agent.arm()
        clock.now += 0.301
        agent.watchdog_step()
        self.assertFalse(agent.health()["armed"])
        self.assertEqual(pi.posts[-1], ("/v2/control/stop", {"reason": "qt_heartbeat_timeout"}))

    def test_drive_is_rejected_without_fresh_heartbeat(self):
        clock = Clock()
        agent = rescue_agent.ControlAgent(FakePi(), clock)
        agent.heartbeat()
        agent.arm()
        clock.now += 0.301
        with self.assertRaises(rescue_agent.AgentError):
            agent.drive(
                {
                    "forwardMilli": 0,
                    "strafeMilli": 0,
                    "turnMilli": 0,
                    "speedLimitPercent": 30,
                    "deadman": True,
                }
            )

    def test_fresh_qt_heartbeat_keeps_pi_lease_alive_without_motion(self):
        clock = Clock()
        pi = FakePi()
        agent = rescue_agent.ControlAgent(pi, clock)
        agent.heartbeat()
        agent.arm()

        agent.watchdog_step()

        self.assertEqual(pi.posts[-1], ("/v2/control/keepalive", {"leaseToken": "lease-1"}))
        self.assertTrue(agent.health()["armed"])

    def test_failed_pi_keepalive_clears_agent_lease(self):
        clock = Clock()
        pi = FakePi()
        agent = rescue_agent.ControlAgent(pi, clock)
        agent.heartbeat()
        agent.arm()
        pi.fail_keepalive = True

        agent.watchdog_step()

        health = agent.health()
        self.assertFalse(health["armed"])
        self.assertEqual(health["lastStopReason"], "pi_keepalive_failed")


if __name__ == "__main__":
    unittest.main()
