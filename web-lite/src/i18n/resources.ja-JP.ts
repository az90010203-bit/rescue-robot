export const jaJP = {
  translation: {
    actions: {
      apply: "適用",
      check: "確認",
      configureCan: "CAN 設定",
      factoryReset: "工場出荷状態へ戻す",
      groupMove: "固定グループ移動",
      move: "移動",
      ping: "Ping",
      readCurrent: "電流読取",
      readFeedback: "フィードバック読取",
      readId: "ID 読取",
      readPid: "PID 読取",
      readPosition: "位置読取",
      readPositionCurrent: "位置 + 電流読取",
      readRawFrames: "生フレーム読取",
      restoreDefaults: "既定値に戻す",
      saveCenter: "中心を保存",
      search: "検索",
      searchBusy: "検索中",
      setCurrent: "電流設定",
      setId: "ID 設定",
      setPid: "PID 設定",
      setBaud: "ビットレート設定",
      torque: "トルク",
      use: "使用",
      writeBitrate: "ビットレート書込",
      writeId: "ID 書込"
    },
    app: {
      eyebrow: "Fixed PC - Pi - MCU console",
      subtitle: "固定プロファイル・JSON 制御経路・CAN1 を先に移行",
      title: "Rescue Robot Lite"
    },
    bridge: {
      serialProtocol: "A-board プロトコル",
      title: "ブリッジ状態"
    },
    camera: {
      main: "メインカメラ",
      secondary: "サブカメラ",
      title: "固定カメラ URL"
    },
    can: {
      autoConfigure: "送信前に CAN を自動設定",
      busy: "{{action}} 実行中...",
      lastCommand: "last command",
      priorityMeta: "{{bus}}・priority {{priority}}",
      resultTitle: "CAN 応答",
      settingsTitle: "CAN サーボ設定",
      singleTitle: "単体サーボ調整",
      title: "ASMG-MD CAN サーボ"
    },
    common: {
      checking: "確認中",
      manual: "manual",
      score: "score"
    },
    empty: {
      noDiscovery: "検索結果はまだありません。",
      noLogs: "イベントはまだありません。"
    },
    errors: {
      canRejected: "CAN コマンドは A-board bridge に受理されませんでした",
      dangerConfirm: "危険操作の前に現在のターゲット ID を入力してください。",
      feetechRejected: "Feetech コマンドは Pi servo bridge に受理されませんでした",
      unknown: "unknown error"
    },
    feetech: {
      bridgeBaud: "ブリッジ baud",
      commandTitle: "Feetech コマンド",
      resultTitle: "Feetech 応答",
      title: "Feetech サーボ"
    },
    fields: {
      acc: "加速度",
      bitrate: "CAN ビットレート",
      centerPercent: "中心比率 %",
      centerPulse: "中心パルス",
      currentRaw: "電流 raw",
      dangerConfirm: "危険確認",
      deadzone: "デッドゾーン",
      direction: "方向",
      directionForward: "正方向",
      directionReverse: "逆方向",
      frequency: "周波数",
      gamepad: "ゲームパッド",
      gamepadPreset: "ゲームパッドプリセット",
      invert: "反転",
      maxPulse: "最大パルス",
      maxDeg: "最大角",
      minPulse: "最小パルス",
      minDeg: "最小角",
      newId: "新 ID",
      pidD: "PID D",
      pidI: "PID I",
      pidP: "PID P",
      pin: "ピン",
      positionDeg: "目標角度",
      pulseUs: "パルス us",
      pwmServo: "PWM サーボ",
      speedRaw: "速度 raw",
      targetId: "ターゲット ID",
      torqueEnabled: "トルク有効"
    },
    gamepad: {
      auto: "自動選択",
      axisMapping: "軸マッピング",
      buttonMapping: "ボタンマッピング",
      input: {
        backward: "後退",
        cameraDown: "カメラ下",
        cameraLeft: "カメラ左",
        cameraPan: "カメラ水平",
        cameraRight: "カメラ右",
        cameraTilt: "カメラ俯仰",
        cameraUp: "カメラ上",
        forward: "前進",
        selectMecanum: "メカナムモード",
        selectTracked: "履帯モード",
        stop: "停止",
        strafe: "横移動",
        turn: "旋回"
      },
      noGamepad: "ゲームパッド未検出",
      presets: {
        generic: "汎用",
        playstation: "PlayStation",
        switchPro: "Switch Pro",
        xinput: "Xbox / XInput"
      },
      title: "ゲームパッド割り当て"
    },
    language: {
      label: "言語"
    },
    logs: {
      canFailed: "CAN 操作に失敗しました: {{message}}",
      feetechFailed: "Feetech 操作に失敗しました: {{message}}",
      healthComplete: "ヘルスチェック完了: {{host}}",
      hostApplied: "Pi ホストを適用: {{host}}",
      manualCommandFailed: "{{label}} に失敗しました: {{message}}",
      noPiCandidate: "オンラインの Pi 候補は見つかりません",
      piCandidateFound: "Pi 候補を発見: {{host}}",
      piSearchFailed: "Pi 検索に失敗しました: {{message}}",
      priorityReset: "優先度を既定値に戻しました"
    },
    manual: {
      backward: "後退",
      canFrontTitle: "前方 CAN ペア",
      canHint: "CAN ジョグは小さな位置ステップで送信します。離すと新しい目標を止め、最後の位置を保持します。",
      canJogTitle: "CAN ジョグ",
      canRearTitle: "後方 CAN ペア",
      dpad: "方向キー",
      forward: "前進",
      gamepadDisabled: "ゲームパッド制御は無効",
      gamepadEnabled: "ゲームパッド制御は有効",
      leftStick: "左スティック",
      mecanumHint: "方向キー / 長押しボタンで mecanum.target を送り、離すと mecanum.stop を送ります。",
      mecanumStop: "メカナム停止",
      mecanumTitle: "メカナム駆動",
      stop: "停止",
      stopReasonCleanup: "手動制御をクリーンアップしました",
      stopReasonGamepadDisabled: "ゲームパッド制御を無効化し、手動動作を停止しました",
      stopReasonGamepadDisconnected: "ゲームパッドが切断され、手動動作を停止しました",
      stopReasonGamepadStop: "ゲームパッドの停止ボタンで手動動作を停止しました",
      stopReasonGamepadUnavailable: "ゲームパッド API が使えないため手動動作を停止しました",
      stopReasonHostChange: "Pi ホスト変更のため手動動作を停止しました",
      stopReasonWindow: "ウィンドウが非アクティブになり、手動動作を停止しました",
      strafeLeft: "左移動",
      strafeRight: "右移動",
      trackedHint: "左スティック / 長押しボタンで M5 と M6 の motor.target を送り、離すと motor.stop を送ります。",
      trackedStop: "履帯停止",
      trackedTitle: "履帯駆動",
      turnLeft: "左旋回",
      turnRight: "右旋回"
    },
    metrics: {
      aBoardPort: "A-board ポート",
      aBoardSerial: "A-board シリアル",
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
      piServoPort: "Pi servo ポート",
      piServoSerial: "Pi servo シリアル",
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
      cameraFeeds: "カメラ",
      deviceStatus: "デバイス状態",
      realtime: "リアルタイムデータ"
    },
    nav: {
      can: "CAN サーボ",
      control: "総合制御",
      feetech: "Feetech サーボ",
      gamepad: "ゲームパッド",
      label: "ワークスペース分類",
      pwm: "PWM サーボ",
      settings: "設定"
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
      architecture: "PC - Pi - MCU 構成",
      eventLog: "イベントログ",
      piDiscovery: "Pi ホスト検索"
    },
    placeholders: {
      dangerConfirm: "{{id}} を入力",
      piHost: "rescue-pi.local または 192.168.x.x"
    },
    priority: {
      meta: "数字が大きいほど先に送信",
      title: "コマンド優先度",
      fields: {
        armServo: {
          detail: "Feetech アーム用の予約枠",
          label: "アームサーボ"
        },
        canServo: {
          detail: "ASMG-MD move/group/config",
          label: "CAN サーボ"
        },
        motor: {
          detail: "motor.target と mecanum.target",
          label: "シャーシモーター"
        },
        safety: {
          detail: "stop、system、保護コマンド",
          label: "停止 / システム"
        },
        telemetry: {
          detail: "imu/read/低頻度ステータス",
          label: "テレメトリ読取"
        }
      }
    },
    pwm: {
      commandTitle: "PWM 目標",
      motorStatusTitle: "PWM モーターマッピング",
      note: "V1 では固定 PWM サーボプロファイルと目標パルスのみを表示します。PWM サーボ用の MCU コマンド経路はまだ接続していません。",
      title: "PWM サーボ"
    },
    settings: {
      fixedProfile: "固定プロファイル"
    },
    services: {
      aBoardBridge: "A-board bridge",
      mainCamera: "メインカメラ",
      piServoBridge: "Pi servo bridge",
      secondaryCamera: "サブカメラ"
    },
    sources: {
      manualUsbFallback: "手動 USB fallback",
      mdns: "mDNS ホスト名",
      saved: "保存済みホスト",
      usbGadgetFallback: "USB gadget fallback",
      usbGadgetHostname: "USB ホスト名"
    },
    status: {
      bridgeOnline: "bridge online",
      closed: "closed",
      notChecked: "未確認",
      notReady: "not ready",
      online: "オンライン",
      open: "open",
      ready: "ready",
      reachableSerialClosed: "到達可能 / シリアル停止",
      standby: "待機"
    }
  }
} as const;
