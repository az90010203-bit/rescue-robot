export const zhCN = {
  translation: {
    actions: {
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
      canFailed: "CAN 操作失败：{{message}}",
      feetechFailed: "飞特操作失败：{{message}}",
      healthComplete: "健康检查完成：{{host}}",
      hostApplied: "已应用 Pi 主机：{{host}}",
      noPiCandidate: "未发现在线 Pi 候选",
      piCandidateFound: "发现候选 Pi：{{host}}",
      piSearchFailed: "Pi 搜索失败：{{message}}",
      priorityReset: "优先级已恢复默认值"
    },
    metrics: {
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
      motorStatusTitle: "PWM 电机映射",
      note: "V1 只显示固定 PWM 舵机画像和目标脉宽；实际 PWM 舵机串口/MCU 命令还未接入。",
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
      bridgeOnline: "bridge online",
      closed: "closed",
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
