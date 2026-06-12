#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

bridge_source_dir="${RESCUE_ROBOT_BRIDGE_SOURCE_DIR:-$repo_root/web/local-services}"
install_root="${RESCUE_ROBOT_INSTALL_DIR:-/opt/rescue-robot}"
bridge_dir="$install_root/bridges"
systemd_dir="${RESCUE_ROBOT_SYSTEMD_DIR:-/etc/systemd/system}"
service_user="${RESCUE_ROBOT_SERVICE_USER:-${SUDO_USER:-pi}}"
boot_config="${RESCUE_ROBOT_BOOT_CONFIG:-}"

a_board_source="$bridge_source_dir/a-board-serial-bridge.py"
pi_servo_source="$bridge_source_dir/pi-servo-serial-bridge.py"
a_board_target="$bridge_dir/a_board_serial_bridge.py"
pi_servo_target="$bridge_dir/pi_servo_serial_bridge.py"

require_file() {
  if [ ! -f "$1" ]; then
    echo "missing required file: $1" >&2
    exit 2
  fi
}

append_config_line() {
  local line="$1"
  local label="$2"
  if [ -z "$boot_config" ] || [ ! -f "$boot_config" ]; then
    echo "$label:boot_config_missing"
    return 0
  fi
  if grep -Eq "^[[:space:]]*${line}([[:space:]]|$)" "$boot_config"; then
    echo "$label:present"
    return 0
  fi
  printf "\n# Rescue Robot Pi image\n%s\n" "$line" >> "$boot_config"
  echo "$label:added"
}

choose_boot_config() {
  if [ -n "$boot_config" ]; then
    return 0
  fi
  if [ -f /boot/firmware/config.txt ]; then
    boot_config=/boot/firmware/config.txt
    return 0
  fi
  if [ -f /boot/config.txt ]; then
    boot_config=/boot/config.txt
    return 0
  fi
  boot_config=
}

write_a_board_service() {
  cat > "$systemd_dir/a-board-serial-bridge.service" <<EOF
[Unit]
Description=RoboMaster A board serial HTTP bridge
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$service_user
WorkingDirectory=$bridge_dir
Environment=A_BOARD_SERIAL_PORT=/dev/ttyAMA5
Environment=A_BOARD_BAUD=115200
Environment=A_BOARD_BRIDGE_HOST=0.0.0.0
Environment=A_BOARD_BRIDGE_PORT=17353
ExecStart=/usr/bin/python3 $a_board_target
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
}

write_pi_servo_service() {
  cat > "$systemd_dir/pi-servo-serial-bridge.service" <<EOF
[Unit]
Description=Rescue Robot Pi Feetech servo serial HTTP bridge
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$service_user
WorkingDirectory=$bridge_dir
Environment=PI_SERVO_SERIAL_PORT=/dev/serial0
Environment=PI_SERVO_BAUD=115200
Environment=PI_SERVO_SERIAL_PROTOCOL=auto
Environment=PI_SERVO_BRIDGE_HOST=0.0.0.0
Environment=PI_SERVO_BRIDGE_PORT=17354
ExecStart=/usr/bin/python3 $pi_servo_target
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
}

install_packages() {
  if [ "${RESCUE_ROBOT_SKIP_APT:-0}" = "1" ]; then
    echo "apt:skipped"
    return 0
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "apt:unavailable"
    return 0
  fi
  apt-get update
  apt-get install -y python3 ffmpeg v4l-utils python3-venv python3-pip
}

enable_services() {
  if [ "${RESCUE_ROBOT_SKIP_SYSTEMD:-0}" = "1" ]; then
    echo "systemd:skipped"
    return 0
  fi
  systemctl daemon-reload
  systemctl stop serial-getty@serial0.service serial-getty@ttyS0.service 2>/dev/null || true
  systemctl enable --now a-board-serial-bridge.service
  systemctl enable --now pi-servo-serial-bridge.service
}

main() {
  require_file "$a_board_source"
  require_file "$pi_servo_source"
  choose_boot_config

  install_packages

  install -d -m 0755 "$bridge_dir"
  install -d -m 0755 "$systemd_dir"
  install -m 0755 "$a_board_source" "$a_board_target"
  install -m 0755 "$pi_servo_source" "$pi_servo_target"

  append_config_line "enable_uart=1" "pi_servo_uart"
  append_config_line "dtoverlay=uart5" "a_board_uart5_overlay"

  write_a_board_service
  write_pi_servo_service
  enable_services

  echo "rescue_pi_image:ready"
  echo "a_board_bridge:http://0.0.0.0:17353 -> /dev/ttyAMA5 @ 115200"
  echo "pi_servo_bridge:http://0.0.0.0:17354 -> /dev/serial0 @ 115200"
}

main "$@"
