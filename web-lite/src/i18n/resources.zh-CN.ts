export const zhCN = {
  translation: {
    actions: {
      calibrateArmZero: "当前姿态设为折叠零位",
      resetArmTarget: "重置机械臂目标",
      apply: "应用",
      check: "检查",
      configureCan: "配置 CAN",
      factoryReset: "恢复出厂",
      groupMove: "固定组移动",
      move: "移动",
      ping: "Ping",
      readCurrent: "读电流",
      readFeedback: "读反馈",
      readId: "读 ID",
      readPid: "读 PID",
      readPosition: "读位置",
      readPositionCurrent: "读位置+电流",
      readRawFrames: "读原始帧",
      restoreDefaults: "恢复默认",
      saveCenter: "保存中心",
      search: "搜索",
      searchBusy: "搜索中",
      setCurrent: "设置电流",
      setId: "设置 ID",
      setPid: "设置 PID",
      setBaud: "设置波特率",
      stopAll: "全部停止",
      torque: "扭矩",
      use: "使用",
      writeBitrate: "写波特率",
      writeId: "写 ID"
    },
    app: {
      eyebrow: "Fixed PC - Pi - MCU console",
      subtitle: "固定画像 · JSON 控制链路 · CAN1 优先迁移",
      title: "Rescue Robot Lite"
    },
    bridge: {
      serialProtocol: "A-board 协议",
      title: "桥接状态"
    },
    camera: {
      main: "主相机",
      secondary: "副相机",
      title: "固定相机地址"
    },
    can: {
      autoConfigure: "发送前自动配置 CAN",
      busy: "{{action}} 中...",
      lastCommand: "last command",
      priorityMeta: "{{bus}} · priority {{priority}}",
      resultTitle: "CAN 返回",
      settingsTitle: "CAN 舵机设置",
      singleTitle: "单舵机调试",
      title: "ASMG-MD CAN 舵机"
    },
    common: {
      no: "否",
      yes: "是",
      checking: "检查中",
      manual: "manual",
      score: "score"
    },
    empty: {
      noDiscovery: "还没有搜索结果。",
      noLogs: "还没有事件。"
    },
    errors: {
      canRejected: "CAN 命令未被 A-board bridge 接受",
      dangerConfirm: "危险操作需要先输入当前目标 ID。",
      feetechRejected: "飞特命令未被 Pi servo bridge 接受",
      unknown: "unknown error"
    },
    feetech: {
      bridgeBaud: "桥接串口",
      commandTitle: "飞特命令",
      resultTitle: "飞特返回",
      title: "飞特舵机"
    },
    fields: {
      angleStep: "角度步进",
      elbowSign: "肘部方向",
      forwardSpeed: "前后速度",
      j1Sign: "J1 方向",
      j2Sign: "J2 方向",
      liftSpeed: "升降速度",
      link1Length: "L1 长度",
      link2Length: "L2 长度",
      maxForward: "最大前伸",
      maxHeight: "最高高度",
      minForward: "最小前伸",
      minHeight: "最低高度",
      trimJ1: "J1 微调",
      trimJ2: "J2 微调",
      acc: "加速度",
      bitrate: "CAN 波特率",
      centerPercent: "中心比例 %",
      centerPulse: "中心脉宽",
      currentRaw: "电流 raw",
      dangerConfirm: "危险确认",
      deadzone: "死区",
      direction: "方向",
      directionForward: "正向",
      directionReverse: "反向",
      frequency: "频率",
      gamepad: "手柄",
      gamepadPreset: "手柄预设",
      invert: "反向",
      maxPulse: "最大脉宽",
      maxDeg: "最大角",
      minPulse: "最小脉宽",
      minDeg: "最小角",
      motorSpeed: "电机速度 %",
      newId: "新 ID",
      pidD: "PID D",
      pidI: "PID I",
      pidP: "PID P",
      pin: "引脚",
      positionDeg: "目标角度",
      pulseUs: "脉宽 us",
      pwmServo: "PWM 舵机",
      speedRaw: "速度 raw",
      targetId: "目标 ID",
      torqueEnabled: "启用扭矩"
    },
    gamepad: {
      auto: "自动选择",
      axisMapping: "摇杆轴映射",
      buttonMapping: "按键映射",
      diagnosticsTitle: "USB 手柄自检",
      diag: {
        activity: "输入活动",
        api: "浏览器 API",
        control: "控制发送",
        device: "USB 设备",
        lastTx: "最后 TX",
        rawAxes: "原始摇杆轴",
        rawButtons: "原始按钮值",
        sourceGamepad: "手柄",
        sourceManual: "主控"
      },
      input: {
        backward: "后退",
        cameraDown: "相机下",
        cameraLeft: "相机左",
        cameraPan: "相机水平",
        cameraRight: "相机右",
        cameraTilt: "相机俯仰",
        cameraUp: "相机上",
        forward: "前进",
        selectMecanum: "麦轮模式",
        selectTracked: "履带模式",
        stop: "急停",
        strafe: "横移",
        turn: "转向"
      },
      noGamepad: "未检测到手柄",
      presets: {
        generic: "通用",
        playstation: "PlayStation",
        switchPro: "Switch Pro",
        xinput: "Xbox / XInput"
      },
      title: "手柄键位"
    },
    language: {
      label: "语言"
    },
    logs: {
      armCalibrated: "已用 ID9/ID10 反馈校准折叠零位",
      armCalibrationFailed: "机械臂校准失败：{{message}}",
      canFailed: "CAN 操作失败：{{message}}",
      feetechFailed: "飞特操作失败：{{message}}",
      healthComplete: "健康检查完成：{{host}}",
      hostApplied: "已应用 Pi 主机：{{host}}",
      manualCommandFailed: "{{label}} 失败：{{message}}",
      noPiCandidate: "未发现在线 Pi 候选",
      piCandidateFound: "发现候选 Pi：{{host}}",
      piSearchFailed: "Pi 搜索失败：{{message}}",
      priorityReset: "优先级已恢复默认值"
    },
    manual: {
      armHint: "右摇杆控制手部目标速度：上下是前后，右/左是上升/下降。",
      armNotCalibrated: "先把当前姿态设为折叠零位，校准前只预览，不下发真机。",
      armTitle: "二连杆机械臂",
      rightStick: "右摇杆",
      backward: "后退",
      canFrontTitle: "前方 CAN 组",
      canHint: "CAN 点动使用小角度位置步进。松开按钮后不再下发新目标，舵机会保持最后位置。",
      canJogTitle: "CAN 点动",
      canRearTitle: "后方 CAN 组",
      dpad: "方向键",
      forward: "前进",
      gamepadDisabled: "手柄控制未启用",
      gamepadEnabled: "手柄控制已启用",
      leftStick: "左摇杆",
      mecanumHint: "方向键 / 按住按钮发送 mecanum.target，松开发送 mecanum.stop。",
      mecanumStop: "麦轮停止",
      mecanumTitle: "麦轮底盘",
      stop: "停止",
      stopReasonCleanup: "手动控制已清理",
      stopReasonGamepadDisabled: "手柄控制已关闭，手动运动已停止",
      stopReasonGamepadDisconnected: "手柄已断开，手动运动已停止",
      stopReasonGamepadStop: "手柄停止键按下，手动运动已停止",
      stopReasonGamepadUnavailable: "手柄 API 不可用，手动运动已停止",
      stopReasonHostChange: "Pi 主机已切换，手动运动已停止",
      stopReasonWindow: "窗口失焦，手动运动已停止",
      strafeLeft: "左移",
      strafeRight: "右移",
      trackedHint: "左摇杆 / 按住按钮发送 M5、M6 电机目标，松开发送 motor.stop。",
      trackedStop: "履带停止",
      trackedTitle: "履带底盘",
      turnLeft: "左旋",
      turnRight: "右旋"
    },
    metrics: {
      armForward: "前后目标",
      armHeight: "高度目标",
      calibrated: "已校准",
      j1Target: "J1 目标",
      j2Target: "J2 目标",
      reachable: "可达",
      workspace: "工作区",
      aBoardPort: "A-board 端口",
      aBoardSerial: "A-board 串口",
      activeCommand: "activeCommand",
      axes: "axes",
      baudRate: "baudRate",
      binaryReady: "binaryReady",
      buttons: "buttons",
      connected: "connected",
      currentRaw: "current raw",
      droppedMotion: "droppedMotion",
      lastError: "lastError",
      motionPending: "motionPending",
      ok: "ok",
      parsedKind: "parsed kind",
      piServoPort: "Pi servo 端口",
      piServoSerial: "Pi servo 串口",
      positionRaw: "position raw",
      protocol: "protocol",
      queueDepth: "queueDepth",
      requestCount: "requestCount",
      mapping: "mapping",
      messageCount: "messageCount",
      serialPort: "serialPort",
      servoId: "servo ID"
    },
    master: {
      cameraFeeds: "摄像头",
      deviceStatus: "设备状态",
      realtime: "实时数据"
    },
    nav: {
      can: "CAN 舵机",
      control: "总控",
      feetech: "飞特舵机",
      gamepad: "手柄",
      label: "工作区分类",
      pwm: "PWM 舵机",
      settings: "设置"
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
      architecture: "PC - Pi - MCU 架构",
      eventLog: "事件日志",
      piDiscovery: "Pi 主机搜索"
    },
    placeholders: {
      dangerConfirm: "输入 {{id}}",
      piHost: "rescue-pi.local 或 192.168.x.x"
    },
    priority: {
      meta: "数字越大越先发",
      title: "命令优先级",
      fields: {
        armServo: {
          detail: "Feetech 机械臂预留",
          label: "机械臂舵机"
        },
        canServo: {
          detail: "ASMG-MD move/group/config",
          label: "CAN 舵机"
        },
        motor: {
          detail: "motor.target、mecanum.target",
          label: "底盘电机"
        },
        safety: {
          detail: "stop、system、保护命令",
          label: "急停 / 系统"
        },
        telemetry: {
          detail: "imu/read/低频状态",
          label: "遥测读取"
        }
      }
    },
    pwm: {
      commandTitle: "PWM 目标",
      motorControlNote: "每个电机行都有独立速度；点击前进/后退会先配置对应通道，再通过 A-board bridge 下发开环 PWM 速度。",
      motorControlTitle: "PWM 电机调速",
      motorStatusTitle: "PWM 电机映射",
      note: "这里显示固定 PWM 舵机画像；M1-M6 电机调速在下方直接下发。",
      title: "PWM 舵机"
    },
    settings: {
      fixedProfile: "固定画像"
    },
    services: {
      aBoardBridge: "A-board bridge",
      mainCamera: "主相机",
      piServoBridge: "Pi servo bridge",
      secondaryCamera: "副相机"
    },
    sources: {
      manualUsbFallback: "手动 USB fallback",
      mdns: "mDNS 主机名",
      saved: "已保存主机",
      usbGadgetFallback: "USB gadget fallback",
      usbGadgetHostname: "USB 主机名"
    },
    status: {
      limited: "已限制",
      bridgeOnline: "bridge online",
      closed: "closed",
      disabled: "关闭",
      enabled: "启用",
      notChecked: "未检查",
      notReady: "not ready",
      online: "在线",
      open: "open",
      ready: "ready",
      reachableSerialClosed: "可达 / 串口关闭",
      standby: "待命"
    }
  }
} as const;
