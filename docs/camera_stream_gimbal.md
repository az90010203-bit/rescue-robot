# Camera Stream and Gimbal Control v1

## System Link

```text
Raspberry Pi camera
  -> MJPEG-over-HTTP stream
  -> Browser UI <img src="http://pi-ip:8080/stream.mjpg">

Browser UI
  -> WebSerial newline-delimited JSON
  -> ESP32
  -> Feetech STS/SCS serial bus
  -> pan/tilt servos
```

The video stream and motion control are intentionally separate. Video frames never travel over USB serial. The Raspberry Pi only needs to expose an MJPEG URL on the same LAN as the browser.

## Browser Configuration

The UI stores camera settings in `localStorage` under `rescue-robot.camera-config.v1`.

Fields:

- `streamUrl`: MJPEG URL, for example `http://192.168.1.20:8080/stream.mjpg`.
- `panServoId`: Feetech servo ID for horizontal motion.
- `tiltServoId`: Feetech servo ID for vertical motion.
- `panMinDeg`, `panMaxDeg`, `tiltMinDeg`, `tiltMaxDeg`: allowed angle limits.
- `panAngleDeg`, `tiltAngleDeg`: current browser-side target angles.
- `stepDeg`: angle delta for each arrow button press.
- `speedRaw`, `acc`: Feetech motion parameters reused from the existing servo command UI.

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

No new ESP32 firmware command is required for the first camera version.
