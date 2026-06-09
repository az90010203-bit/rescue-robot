# 机器人运行时与串口通信优化方案

## 1. 目标

本方案用于统一救援机器人控制链路，并降低 Raspberry Pi 到 MCU 串口的实时通信负担。

推荐架构是：

```text
PC/Web 语义 JSON
  -> Raspberry Pi Gateway + Robot Runtime Manifest
  -> COBS + CRC16 短二进制帧
  -> MCU/A 板控制代码
```

核心原则：

- PC 只表达“要做什么”，不直接负责底层控制、混控、PID、CAN 帧细节。
- Raspberry Pi 是机器人网关，负责缓存机器人配置、解析插件/组件/机器人关系、把语义命令翻译为短帧。
- MCU/A 板负责实时控制代码，包括电机闭环、麦克纳姆轮混控、CAN 舵机协议、队列调度和 latest-wins。
- 实时链路优先低延迟、可恢复、少传数据；不要把实时控制做 gzip 压缩。
- 上传配置、脚本、固件包时可以压缩、签名或加密；实时控制不要依赖通用压缩。

## 2. 当前结构与目标结构

| 层级 | 当前含义 | 目标含义 | 需要调整的方向 |
| --- | --- | --- | --- |
| 插件 Plugin | 已基本对应设备实例，例如 CAN 舵机、电机、相机、Pi | 严格对应现实中的一个物理设备或硬件接口 | 插件参数是设备唯一真实参数源，例如 ID、限位、方向、总线、波特率 |
| 组件 Component | 组合插件形成机械臂、麦轮、CAN 舵机组等 | 在插件基础上增加集群、同步、脚本化、联动行为 | 组件只引用插件，不复制插件参数；调插件或调组件看到的是同一份设备参数 |
| 机器人 Robot | 引用组件和直属插件，保存装配、按钮和程序 | 完整 robot runtime manifest | 机器人包含运行所需的组件拓扑、插件映射、网关目标和调度策略 |
| PC/Web | 生成平台命令，部分地方仍做参数转换和编排 | UI、配置编辑、日志、语义命令发起者 | 不拆底层帧，不生成 CAN raw frame，不重复发送 live 配置 |
| Raspberry Pi | HTTP 桥和部分语义翻译 | Gateway、manifest 缓存、协议翻译、调度器 | 接收 JSON，查 manifest，输出固定短帧到对应 MCU |
| MCU/A 板 | 已有部分语义命令和 latest-wins | 实时控制执行者 | 内置 PID、麦轮混控、CAN 舵机控制、运动目标去旧留新 |

目标状态下，插件、组件和机器人是逐级增强关系：

```text
插件 = 现实设备
组件 = 设备组 + 同步/脚本/联动
机器人 = 组件集合 + 运行时 manifest + 全局调度
```

组件和机器人不应复制插件参数。它们只引用插件，并增加“如何一起运动、如何同步、如何脚本化”的行为参数。

## 3. 推荐链路

### 3.1 PC/Web 到 Pi：保留语义 JSON

PC/Web 到 Raspberry Pi 不建议第一阶段改成二进制。原因是这段通常走 LAN/Wi-Fi/以太网，不是主要瓶颈；保持 JSON 更利于调试、日志和跨机器人统一。

示例：

```json
{
  "type": "mecanum-drive.set_velocity",
  "target": "base",
  "forward": 0.2,
  "strafe": 0,
  "turn": -0.1,
  "speedLimitPercent": 80
}
```

PC/Web 不需要知道 `base` 下面具体是哪 4 个电机，也不需要知道这些电机对应哪个 MCU 通道。Pi Gateway 通过 runtime manifest 查表。

### 3.2 Pi 到 MCU：短二进制帧

Pi 到 MCU 是高频实时链路，建议改为短帧：

```text
version + seq + targetId + opcode + flags + payload + crc16
```

帧边界使用 `COBS`，校验使用 `CRC16`。

推荐二进制帧结构：

| 字段 | 大小 | 说明 |
| --- | ---: | --- |
| version | 1 byte | 协议版本，V1 固定为 1 |
| seq | 1-2 bytes | 序号，用于 ACK、诊断和丢旧 |
| targetId | 1 byte | Pi manifest 中分配的目标编号，例如 1=base、2=claw |
| opcode | 1 byte | 固定指令编号，例如 0x11=麦轮速度 |
| flags | 1 byte | latest-wins、requiresAck、priority 等标志 |
| payload | 0-N bytes | 定点数、整数、短数组，不传字符串字段名 |
| crc16 | 2 bytes | 对未 COBS 编码前的帧体做校验 |

COBS 编码后用 `0x00` 作为帧分隔符。接收端发现 CRC 错误或解码失败时丢弃当前帧，并等待下一个 `0x00` 快速恢复。

### 3.3 定点数代替浮点字符串

实时控制不要传 `"forward":0.2` 这种字符串 JSON。Pi 翻译时把它变成定点整数：

```text
forward = round(0.2 * 1000) = 200
turn    = round(-0.1 * 1000) = -100
```

这样 MCU 只需要读整数，不需要解析浮点或 JSON 字段名。

## 4. 优化优先级

### 4.1 少发

UI 拖动、摇杆和 3D 控制事件可能一秒产生几百次。Pi 不应每次都写串口。

推荐策略：

- PC/Web 发语义目标，不发每个中间步骤。
- Pi 对 live motion 使用 latest-wins，只保留最新目标。
- 小于阈值的变化不发，例如速度变化小于 1%-2% 时跳过。
- stop、急停、配置、读取类命令不可丢，优先级高于普通 motion。

### 4.2 定时发

实时控制不要跟随 UI 事件频率，而是由 Pi 以固定频率发送最新目标。

推荐频率：

| 类型 | 推荐频率 |
| --- | ---: |
| 麦轮/电机 live 控制 | 50-100 Hz |
| CAN 舵机组 live 控制 | 50-100 Hz |
| 空闲 IMU 回传 | 10-20 Hz |
| 忙时 IMU 回传 | 5-10 Hz 或跳帧 |
| 异常/急停反馈 | 立即上报 |

### 4.3 只发目标

PC/Pi 不要持续发送每一个插值点。比如机械臂或 CAN 舵机组只发送目标：

```text
move group claw to [30, 60, 90, 120], speed=300, profile=smooth
```

MCU 根据速度、限位、PID 和插值策略生成中间过程。

### 4.4 MCU 内部控制

MCU/A 板应持有完整控制逻辑：

- 电机闭环 PID。
- 麦克纳姆轮速度混控。
- CAN 舵机帧生成和解析。
- live motion latest-wins。
- stop/急停清空 pending motion。
- 读取、配置、危险写入类命令按 FIFO 或安全流程执行。

### 4.5 批量帧

能一帧表达的集群动作，不要拆成多条串口命令。

例如 4 个 CAN 舵机同步运动，Pi 到 MCU 应使用一条 group move 帧，而不是 4 条 `can_servo.move`：

```text
targetId = claw
opcode   = GROUP_CAN_SERVO_MOVE
payload  = [id1,pos1,id2,pos2,id3,pos3,id4,pos4,speed]
```

### 4.6 链路诊断

每条实时链路都应暴露诊断字段：

- `bytesIn`
- `bytesOut`
- `framesIn`
- `framesOut`
- `crcError`
- `cobsError`
- `dropCount`
- `queueDepth`
- `inFlight`
- `lastAckMs`
- `lastFrameMs`
- `lastError`

这些字段用于判断问题来自串口线、电源、队列、MCU 忙、协议错误还是上层发送过快。

## 5. 短帧 V1 建议 opcode

第一阶段只覆盖 A 板实时路径。

| target | opcode | 含义 | payload |
| --- | ---: | --- | --- |
| base | 0x10 | stop | `stopMode` |
| base | 0x11 | mecanum velocity | `forward_i16, strafe_i16, turn_i16, limit_u8, stopMode_u8` |
| motor | 0x20 | single motor target | `channel_u8, speed_i16, stopMode_u8` |
| can-servo-group | 0x30 | group move | `count_u8, repeated(id_u8, pos_u16), speed_u16` |
| can-servo | 0x31 | read | `id_u8, request_u8` |
| imu | 0x40 | imu read | `requestFlags_u8` |
| system | 0x70 | ping | empty |
| system | 0x71 | sync manifest version | `manifestVersion_u16` |

字段命名只用于文档和代码生成。实际串口不传字段名，只传固定顺序的 payload。

## 6. 速率收益估算

当前 UART 如果是 `115200 8N1`：

```text
115200 bit/s / 10 bit per byte = 11520 byte/s
```

常见 JSON 命令大小和短帧对比：

| 命令 | JSON 估算 | 短帧估算 | 数据量减少 |
| --- | ---: | ---: | ---: |
| 单电机目标 | 70-90 bytes | 8-14 bytes | 80%-90% |
| 麦轮速度 | 90-120 bytes | 14-20 bytes | 80%-88% |
| CAN 舵机 move | 65-90 bytes | 10-16 bytes | 78%-89% |
| IMU 回传 | 200-500 bytes | 30-60 bytes | 75%-90% |

预期效果：

- Pi 到 MCU 串口数据量减少约 80%-90%。
- 稳定实时控制频率从约 20-50 Hz 提升到约 100-200 Hz。
- MCU 解析成本下降，因为不再解析 JSON 字符串和浮点文本。
- 即使不提高波特率，串口队列堆积和 stale command 风险也会明显降低。

不建议把目标设为极限吞吐。机器人控制应优先稳定，建议先把 live 控制上限定在 50-100 Hz。

## 7. 压缩、编码、加密的区别

### 7.1 实时控制不要 gzip

实时控制包通常很小，gzip 这类通用压缩会带来额外头部、缓冲和 CPU 开销，可能增加延迟。实时链路应使用：

- opcode
- 短 targetId
- 定点数
- 批量帧
- latest-wins
- COBS + CRC16

### 7.2 上传包可以压缩/签名/加密

robot manifest、脚本、固件、配置包可以使用：

- gzip 或 zstd 压缩，减少上传大小。
- 签名，确认内容未被篡改。
- 加密，保护内容不被读取。

顺序通常是：

```text
原始内容 -> 压缩 -> 签名/校验 -> 加密
```

加密本身通常不减少数据量。减少数据量依靠编码或压缩；保护内容依靠加密和签名。

## 8. 迁移路线

### V1：Pi 到 A 板短帧

目标：

- PC/Web 仍发送语义 JSON。
- Pi A 板桥支持 JSON 模式和 binary 模式。
- A 板固件新增 COBS + CRC16 短帧解析。
- 覆盖 `mecanum.target`、`motor.target`、`can_servo.move`、`imu.read`、`stop`。
- health 暴露 `binaryProtocolReady`、`crcError`、`cobsError`、`dropCount`、`lastFrameMs`。

兼容：

- 保留当前 newline JSON 作为 bring-up 和调试 fallback。
- binary 模式出错时可退回 JSON 模式。

### V2：Pi runtime manifest

目标：

- PC/Web 下发 robot runtime manifest。
- Pi 缓存插件、组件、机器人映射。
- PC/Web live 命令只带语义目标，例如 `base`、`claw`、`arm`。
- Pi 根据 manifest 将语义目标映射为 `targetId + opcode + payload`。
- 组件级同步和脚本化先在 Pi 执行，实时插值逐步下沉到 MCU。

manifest 应包含：

- 插件实例及真实设备参数。
- 组件到插件的引用关系。
- 机器人到组件的引用关系。
- Pi 到 MCU 的路由表。
- targetId/opcode 映射版本。
- 安全限制、频率上限、telemetry 策略。

### V3：PC 到 Pi 二进制/CBOR 可选

只有在以下情况才考虑：

- 远程弱网控制。
- 大量 manifest 或脚本频繁上传。
- PC 到 Pi 也需要严格低延迟高频流。

推荐优先考虑 CBOR 或 MessagePack，而不是自定义裸二进制。普通 UI 操作和调试路径继续保留 JSON。

## 9. 参考资料

- COBS: Consistent Overhead Byte Stuffing  
  https://www.stuartcheshire.org/papers/COBSforToN.pdf
- RFC 1662: PPP in HDLC-like Framing  
  https://www.rfc-editor.org/rfc/rfc1662
- RFC 8949: Concise Binary Object Representation (CBOR)  
  https://www.rfc-editor.org/rfc/rfc8949
- Protocol Buffers Encoding: varint, tag and TLV ideas  
  https://protobuf.dev/programming-guides/encoding/

这些资料的用途：

- COBS 用于可靠帧边界和断帧恢复。
- CRC/FCS 思路来自 HDLC/PPP 类协议，用于检测传输错误。
- CBOR 用于理解 JSON 语义数据如何转成紧凑二进制。
- Protocol Buffers encoding 用于借鉴 field number、varint、ZigZag 和 TLV 思路。

## 10. 推荐结论

第一优先级不是把所有链路都压缩，而是把实时串口链路改成“少发、定时发、只发目标、MCU 自己控制”。

推荐最终状态：

```text
PC/Web:
  编辑插件、组件、机器人
  下发 manifest
  发送语义 JSON 命令

Raspberry Pi:
  缓存 robot runtime manifest
  做 gateway 和调度
  把语义命令翻译成短帧

MCU/A 板:
  执行 PID、麦轮混控、CAN 舵机协议
  执行 latest-wins motion scheduler
  输出低频或事件化 telemetry
```

这条路线能在保留 PC/Web 可调试性的同时，把最关键的 Pi 到 MCU 串口负担降到最低。
