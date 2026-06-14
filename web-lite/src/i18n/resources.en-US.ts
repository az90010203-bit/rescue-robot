export const enUS = {
  translation: {
    actions: {
      apply: "Apply",
      calibrateArmZero: "Set folded zero",
      check: "Check",
      configureCan: "Configure CAN",
      factoryReset: "Factory reset",
      groupMove: "Fixed group move",
      move: "Move",
      ping: "Ping",
      readCurrent: "Read current",
      readFeedback: "Read feedback",
      readId: "Read ID",
      readPid: "Read PID",
      readPosition: "Read position",
      readPositionCurrent: "Read position + current",
      readRawFrames: "Read raw frames",
      resetArmTarget: "Reset arm target",
      restoreDefaults: "Restore defaults",
      saveCenter: "Save center",
      search: "Search",
      searchBusy: "Searching",
      setCurrent: "Set current",
      setId: "Set ID",
      setPid: "Set PID",
      setBaud: "Set bitrate",
      stopAll: "Stop all",
      torque: "Torque",
      use: "Use",
      writeBitrate: "Write bitrate",
      writeId: "Write ID"
    },
    app: {
      eyebrow: "Fixed PC - Pi - MCU console",
      subtitle: "Fixed profile · JSON control path · CAN1 migration first",
      title: "Rescue Robot Lite"
    },
    bridge: {
      serialProtocol: "A-board protocol",
      title: "Bridge status"
    },
    camera: {
      main: "Main camera",
      secondary: "Secondary camera",
      title: "Fixed camera URLs"
    },
    can: {
      autoConfigure: "Auto-configure CAN before sending",
      busy: "{{action}} in progress...",
      lastCommand: "last command",
      priorityMeta: "{{bus}} · priority {{priority}}",
      resultTitle: "CAN response",
      settingsTitle: "CAN servo settings",
      singleTitle: "Single-servo debug",
      title: "ASMG-MD CAN servo"
    },
    common: {
      checking: "checking",
      manual: "manual",
      no: "no",
      yes: "yes",
      score: "score"
    },
    empty: {
      noDiscovery: "No discovery results yet.",
      noLogs: "No events yet."
    },
    errors: {
      canRejected: "The CAN command was not accepted by the A-board bridge",
      dangerConfirm: "Enter the current target ID before running a dangerous action.",
      feetechRejected: "The Feetech command was not accepted by the Pi servo bridge",
      unknown: "unknown error"
    },
    feetech: {
      bridgeBaud: "Bridge baud",
      commandTitle: "Feetech command",
      resultTitle: "Feetech response",
      title: "Feetech servo"
    },
    fields: {
      acc: "Acceleration",
      angleStep: "Angle step",
      bitrate: "CAN bitrate",
      centerPercent: "Center ratio %",
      centerPulse: "Center pulse",
      currentRaw: "Current raw",
      dangerConfirm: "Danger confirm",
      deadzone: "Deadzone",
      direction: "Direction",
      directionForward: "Forward",
      directionReverse: "Reverse",
      elbowSign: "Elbow branch",
      forwardSpeed: "Forward speed",
      frequency: "Frequency",
      gamepad: "Gamepad",
      gamepadPreset: "Gamepad preset",
      invert: "Invert",
      j1Sign: "J1 sign",
      j2Sign: "J2 sign",
      liftSpeed: "Lift speed",
      link1Length: "L1 length",
      link2Length: "L2 length",
      maxForward: "Max forward",
      maxHeight: "Max height",
      maxPulse: "Max pulse",
      maxDeg: "Max angle",
      minForward: "Min forward",
      minHeight: "Min height",
      minPulse: "Min pulse",
      minDeg: "Min angle",
      motorSpeed: "Motor speed %",
      newId: "New ID",
      pidD: "PID D",
      pidI: "PID I",
      pidP: "PID P",
      pin: "Pin",
      positionDeg: "Target angle",
      pulseUs: "Pulse us",
      pwmServo: "PWM servo",
      speedRaw: "Speed raw",
      targetId: "Target ID",
      trimJ1: "J1 trim",
      trimJ2: "J2 trim",
      torqueEnabled: "Torque enabled"
    },
    gamepad: {
      auto: "Auto-select",
      axisMapping: "Axis mapping",
      buttonMapping: "Button mapping",
      diagnosticsTitle: "USB gamepad self-test",
      diag: {
        activity: "Input activity",
        api: "Browser API",
        control: "Control output",
        device: "USB device",
        lastTx: "Last TX",
        rawAxes: "Raw axes",
        rawButtons: "Raw buttons",
        sourceGamepad: "gamepad",
        sourceManual: "manual"
      },
      input: {
        backward: "Backward",
        cameraDown: "Camera down",
        cameraLeft: "Camera left",
        cameraPan: "Camera pan",
        cameraRight: "Camera right",
        cameraTilt: "Camera tilt",
        cameraUp: "Camera up",
        forward: "Forward",
        selectMecanum: "Mecanum mode",
        selectTracked: "Tracked mode",
        stop: "Stop",
        strafe: "Strafe",
        turn: "Turn"
      },
      noGamepad: "No gamepad detected",
      presets: {
        generic: "Generic",
        playstation: "PlayStation",
        switchPro: "Switch Pro",
        xinput: "Xbox / XInput"
      },
      title: "Gamepad mapping"
    },
    language: {
      label: "Language"
    },
    logs: {
      armCalibrated: "Arm folded zero calibrated from ID9/ID10 feedback",
      armCalibrationFailed: "Arm calibration failed: {{message}}",
      canFailed: "CAN operation failed: {{message}}",
      feetechFailed: "Feetech operation failed: {{message}}",
      healthComplete: "Health check complete: {{host}}",
      hostApplied: "Applied Pi host: {{host}}",
      manualCommandFailed: "{{label}} failed: {{message}}",
      noPiCandidate: "No online Pi candidate found",
      piCandidateFound: "Pi candidate found: {{host}}",
      piSearchFailed: "Pi search failed: {{message}}",
      priorityReset: "Priority values restored to defaults"
    },
    manual: {
      armHint: "Right stick controls hand target speed: up/down is forward/back, right/left is lift/lower.",
      armNotCalibrated: "Calibrate folded zero before real arm commands are sent. Preview stays active.",
      armTitle: "Two-link arm",
      backward: "Backward",
      canFrontTitle: "Front CAN pair",
      canHint: "CAN jog uses small position steps. Releasing the button stops new targets and holds the last position.",
      canJogTitle: "CAN jog",
      canRearTitle: "Rear CAN pair",
      dpad: "D-pad",
      forward: "Forward",
      gamepadDisabled: "Gamepad control disabled",
      gamepadEnabled: "Gamepad control enabled",
      leftStick: "Left stick",
      mecanumHint: "D-pad / hold buttons send mecanum.target. Release sends mecanum.stop.",
      mecanumStop: "Mecanum stop",
      mecanumTitle: "Mecanum drive",
      rightStick: "Right stick",
      stop: "Stop",
      stopReasonCleanup: "Manual control cleaned up",
      stopReasonGamepadDisabled: "Gamepad control disabled; manual motion stopped",
      stopReasonGamepadDisconnected: "Gamepad disconnected; manual motion stopped",
      stopReasonGamepadStop: "Gamepad stop pressed; manual motion stopped",
      stopReasonGamepadUnavailable: "Gamepad API unavailable; manual motion stopped",
      stopReasonHostChange: "Pi host changed; manual motion stopped",
      stopReasonWindow: "Window inactive; manual motion stopped",
      strafeLeft: "Left",
      strafeRight: "Right",
      trackedHint: "Left stick / hold buttons send M5 and M6 motor targets. Release sends motor stops.",
      trackedStop: "Tracked stop",
      trackedTitle: "Tracked drive",
      turnLeft: "Turn left",
      turnRight: "Turn right"
    },
    metrics: {
      aBoardPort: "A-board port",
      aBoardSerial: "A-board serial",
      activeCommand: "activeCommand",
      armForward: "arm forward",
      armHeight: "arm height",
      axes: "axes",
      baudRate: "baudRate",
      binaryReady: "binaryReady",
      buttons: "buttons",
      calibrated: "calibrated",
      connected: "connected",
      currentRaw: "current raw",
      droppedMotion: "droppedMotion",
      j1Target: "J1 target",
      j2Target: "J2 target",
      lastError: "lastError",
      motionPending: "motionPending",
      ok: "ok",
      parsedKind: "parsed kind",
      piServoPort: "Pi servo port",
      piServoSerial: "Pi servo serial",
      positionRaw: "position raw",
      protocol: "protocol",
      queueDepth: "queueDepth",
      reachable: "reachable",
      requestCount: "requestCount",
      mapping: "mapping",
      messageCount: "messageCount",
      serialPort: "serialPort",
      servoId: "servo ID",
      workspace: "workspace"
    },
    master: {
      cameraFeeds: "Cameras",
      deviceStatus: "Device status",
      realtime: "Realtime data"
    },
    nav: {
      can: "CAN servo",
      control: "Control",
      feetech: "Feetech servo",
      gamepad: "Gamepad",
      label: "Workspace sections",
      pwm: "PWM servo",
      settings: "Settings"
    },
    nodes: {
      aBoardBridge: "A-board Bridge",
      camera: "Camera",
      canBus: "CAN1 / ASMG-MD",
      feetechBus: "Feetech Bus",
      mcuUart: "MCU / UART5",
      pcWebLite: "PC Web-Lite",
      raspberryPi: "Raspberry Pi"
    },
    panels: {
      architecture: "PC - Pi - MCU architecture",
      eventLog: "Event log",
      piDiscovery: "Pi host discovery"
    },
    placeholders: {
      dangerConfirm: "Enter {{id}}",
      piHost: "rescue-pi.local or 192.168.x.x"
    },
    priority: {
      meta: "Larger numbers run first",
      title: "Command priority",
      fields: {
        armServo: {
          detail: "Reserved for the Feetech arm",
          label: "Arm servos"
        },
        canServo: {
          detail: "ASMG-MD move/group/config",
          label: "CAN servos"
        },
        motor: {
          detail: "motor.target and mecanum.target",
          label: "Chassis motors"
        },
        safety: {
          detail: "stop, system, and protection commands",
          label: "Stop / system"
        },
        telemetry: {
          detail: "imu/read/low-rate status",
          label: "Telemetry reads"
        }
      }
    },
    pwm: {
      commandTitle: "PWM target",
      motorControlNote: "Each motor row keeps its own speed. Forward/reverse configures that channel first, then sends open-loop PWM speed through the A-board bridge.",
      motorControlTitle: "PWM motor speed",
      motorStatusTitle: "PWM motor mapping",
      note: "The fixed PWM servo profile is shown here. M1-M6 motor speed commands are available below.",
      title: "PWM servo"
    },
    settings: {
      fixedProfile: "Fixed profile"
    },
    services: {
      aBoardBridge: "A-board bridge",
      mainCamera: "Main camera",
      piServoBridge: "Pi servo bridge",
      secondaryCamera: "Secondary camera"
    },
    sources: {
      manualUsbFallback: "Manual USB fallback",
      mdns: "mDNS hostname",
      saved: "Saved host",
      usbGadgetFallback: "USB gadget fallback",
      usbGadgetHostname: "USB hostname"
    },
    status: {
      bridgeOnline: "bridge online",
      closed: "closed",
      disabled: "disabled",
      enabled: "enabled",
      limited: "limited",
      notChecked: "not checked",
      notReady: "not ready",
      online: "online",
      open: "open",
      ready: "ready",
      reachableSerialClosed: "reachable / serial closed",
      standby: "standby"
    }
  }
} as const;
