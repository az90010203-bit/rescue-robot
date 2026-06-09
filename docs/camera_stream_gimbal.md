# Camera Stream and Gimbal Control v1

## System Link

```text
Raspberry Pi camera
  -> MJPEG-over-HTTP stream
  -> Browser UI <img src="http://pi-ip:8080/stream">

Second Raspberry Pi camera
  -> MJPEG-over-HTTP stream
  -> Browser UI <img src="http://pi-ip:8081/stream">

Browser UI
  -> WebSerial newline-delimited JSON
  -> ESP32
  -> Feetech STS/SCS serial bus
  -> pan/tilt servos
```

The video stream and motion control are intentionally separate. Video frames never travel over USB serial or through the local Pi helper. The Raspberry Pi only needs to expose MJPEG URLs on the same LAN as the browser.

`pi-image/install-rescue-pi.sh` installs the persistent Pi HTTP bridges during image provisioning or first boot. `pi-helper.mjs` is only the SSH/SFTP management plane for setup, upload, camera start/stop/check, and manual bridge upgrade/repair. It schedules operations by resource so Pi management is serialized per host, camera management is serialized per host/port, and repeated pending camera checks keep the newest request. Real-time motor and servo traffic uses the persistent Pi HTTP bridges instead of SSH. A-board motor/mecanum/CAN-servo control goes through `http://<pi-host>:17353/command` as semantic JSON; the Type A firmware handles closed loop, mecanum mixing, CAN frame details, and latest-wins motion dropping.

## Browser Configuration

The UI stores camera settings in `localStorage` under `rescue-robot.camera-config.v1`.

Fields:

- `streamUrl`: legacy/main MJPEG URL, for example `http://192.168.1.20:8080/stream`.
- `videoSources`: ordered video source list. The built-in defaults are `main` on `/dev/video0:8080` and `secondary` on `/dev/video1:8081`.
- `activeVideoSourceId`: selected source for single-window viewing.
- `videoLayout`: `single` shows the selected source, while `dual` shows main and secondary at the same time. Dual output is simultaneous display only; it does not perform frame-level timestamp alignment.
- `panServoId`: Feetech servo ID for horizontal motion.
- `tiltServoId`: Feetech servo ID for vertical motion.
- `panMinDeg`, `panMaxDeg`, `tiltMinDeg`, `tiltMaxDeg`: allowed angle limits.
- `panAngleDeg`, `tiltAngleDeg`: current browser-side target angles.
- `stepDeg`: angle delta for each arrow button press.
- `speedRaw`, `acc`: Feetech motion parameters reused from the existing servo command UI.

## Raspberry Pi Streams

The Pi remote camera helper accepts a source device and port. Runtime files are isolated by port so both MJPEG services can run together:

- Main camera: device `camera:main`, V4L2 path `/dev/video0`, port `8080`, URL `http://<pi-host>:8080/stream`.
- Second camera: device `camera:secondary`, V4L2 path `/dev/video1`, port `8081`, URL `http://<pi-host>:8081/stream`.

The second camera is exposed as the built-in `builtin.secondary-camera` plugin. It is video-only and supports stream status, detection, start, and stop actions. It does not send gimbal movement commands.

## Gimbal Command Shape

Gimbal movement reuses the existing `servo.move` command with `sync: true` and two targets.

```json
{
  "type": "servo.move",
  "seq": 12,
  "sync": true,
  "targets": [
    { "id": 1, "name": "Camera Pan", "angleDeg": 95, "speedRaw": 800, "acc": 30 },
    { "id": 2, "name": "Camera Tilt", "angleDeg": 90, "speedRaw": 800, "acc": 30 }
  ]
}
```

No new ESP32 firmware command is required for camera video. Gimbal commands remain bound to the main camera servos even when the active single-window video source is the second camera.
