import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const firmware = await readFile(new URL("../../firmware/robomaster_a_controller/baremetal/main.c", import.meta.url), "utf8");

test("RoboMaster A controller exposes semantic motor, mecanum, and CAN servo commands", () => {
  for (const command of [
    "motor.target",
    "mecanum.config",
    "mecanum.target",
    "mecanum.stop",
    "can_servo.config",
    "can_servo.move",
    "can_servo.group_move",
    "can_servo.read",
    "can_servo.set_current",
    "can_servo.pid",
    "can_servo.set_id",
    "can_servo.save_center",
    "can_servo.factory_reset",
  ]) {
    assert.match(firmware, new RegExp(`str_eq\\(type, "${command.replace(".", "\\.")}"\\)`));
  }
});

test("RoboMaster A controller owns mecanum defaults and latest-wins motion scheduling", () => {
  assert.match(firmware, /#define MOTOR_COUNT 8u/);
  assert.match(firmware, /#define MOTOR_SUPPORT_MESSAGE "A board firmware supports M1-M8"/);
  assert.match(firmware, /state->closed_loop_enabled = motor_pins\[index\]\.has_encoder \? 1u : 0u;/);
  assert.match(firmware, /static int32_t mecanum_direction\[MOTOR_COUNT\] = \{ 1, 1, 1, 1, 1, 1, 1, 1 \};/);
  assert.match(firmware, /static uint32_t mecanum_closed_loop = 1;/);
  assert.match(firmware, /static const uint32_t mecanum_channel_map\[4\] = \{ 0, 1, 2, 3 \};/);
  assert.match(firmware, /static void init_pwm_timers\(void\)/);
  assert.match(firmware, /init_pwm_timer\(TIM4_BASE\);/);
  assert.match(firmware, /init_pwm_timer\(TIM5_BASE\);/);
  assert.match(firmware, /static uint32_t apply_motor_pin_config_from_json/);
  assert.match(firmware, /dropped_motion_count\+\+;/);
  assert.match(firmware, /pending_motion = motion;/);
  assert.match(firmware, /clear_pending_motion\("cleared by motor.stop"\);/);
  assert.match(firmware, /clear_pending_motion\("cleared by mecanum.stop"\);/);
});

test("RoboMaster A controller builds ASMG-MD CAN servo frames on board", () => {
  assert.match(firmware, /#define ASMG_MD_HOST_EXTENDED_ID 0x18EF0201u/);
  assert.match(firmware, /init_can1_pd0_pd1\(250\);/);
  assert.match(firmware, /static void build_asmg_move/);
  assert.match(firmware, /static void build_asmg_read/);
  assert.match(firmware, /static void build_asmg_u16_command/);
  assert.match(firmware, /static void build_asmg_pid/);
  assert.match(firmware, /send_can_servo_feedback/);
});

test("RoboMaster A controller supports V1 COBS binary serial frames", () => {
  assert.match(firmware, /#define BINARY_PROTOCOL_VERSION 1u/);
  assert.match(firmware, /#define BINARY_OPCODE_MECANUM_VELOCITY 0x11u/);
  assert.match(firmware, /#define BINARY_OPCODE_CAN_SERVO_GROUP_MOVE 0x30u/);
  assert.match(firmware, /static uint16_t crc16_ccitt_false/);
  assert.match(firmware, /0x1021u/);
  assert.match(firmware, /static uint32_t cobs_decode/);
  assert.match(firmware, /static void handle_binary_frame/);
  assert.match(firmware, /static void process_uart_rx_value/);
  assert.match(firmware, /send_protocol_feedback/);
  assert.match(firmware, /str_eq\(type, "system\.protocol"\)/);
  assert.match(firmware, /handle_binary_frame\(rx_binary, \*rx_binary_len\)/);
});

test("RoboMaster A controller queues CAN servo group moves as one latest-wins motion", () => {
  assert.match(firmware, /MOTION_CAN_SERVO_GROUP_MOVE/);
  assert.match(firmware, /CanServoMotionTarget can_servo_targets\[CAN_SERVO_GROUP_MAX_TARGETS\]/);
  assert.match(firmware, /static void handle_can_servo_group_move/);
  assert.match(firmware, /queue_motion\(motion, "can_servo\.group_move"\)/);
  assert.match(firmware, /static void apply_can_servo_group_move_motion/);
  assert.match(firmware, /send_can_servo_feedback\(motion->seq, "can_servo\.group_move"/);
});

test("RoboMaster A controller parses JSON motion priority without changing binary frames", () => {
  assert.match(firmware, /#define COMMAND_PRIORITY_STOP 100/);
  assert.match(firmware, /#define COMMAND_PRIORITY_MOTOR 80/);
  assert.match(firmware, /#define COMMAND_PRIORITY_CAN_SERVO 40/);
  assert.match(firmware, /#define COMMAND_PRIORITY_TELEMETRY 20/);
  assert.match(firmware, /int32_t priority;/);
  assert.match(firmware, /static int32_t motion_priority_from_json\(const char \*line, int32_t fallback\)/);
  assert.match(firmware, /json_int_or\(line, "priority", &priority, fallback\)/);
  assert.match(firmware, /motion\.priority = motion_priority_from_json\(line, COMMAND_PRIORITY_MOTOR\);/);
  assert.match(firmware, /motion\.priority = motion_priority_from_json\(line, COMMAND_PRIORITY_CAN_SERVO\);/);
  assert.match(firmware, /send_scheduler_feedback_with_priority\(motion\.seq, command, 1, "queued latest motion target", motion\.priority\)/);
  assert.match(firmware, /uart_write_str\(",\\"priority\\":"\)/);
  assert.match(firmware, /motion\.priority = COMMAND_PRIORITY_MOTOR;/);
  assert.match(firmware, /motion\.priority = COMMAND_PRIORITY_CAN_SERVO;/);
});
