#include <stdint.h>

#define RCC_CR (*(volatile uint32_t *)0x40023800u)
#define RCC_CFGR (*(volatile uint32_t *)0x40023808u)
#define RCC_APB1RSTR (*(volatile uint32_t *)0x40023820u)
#define RCC_AHB1ENR (*(volatile uint32_t *)0x40023830u)
#define RCC_APB1ENR (*(volatile uint32_t *)0x40023840u)
#define RCC_APB2ENR (*(volatile uint32_t *)0x40023844u)

#define GPIOA_BASE 0x40020000u
#define GPIOB_BASE 0x40020400u
#define GPIOC_BASE 0x40020800u
#define GPIOD_BASE 0x40020C00u
#define GPIOE_BASE 0x40021000u
#define GPIOF_BASE 0x40021400u
#define GPIOG_BASE 0x40021800u
#define GPIOH_BASE 0x40021C00u
#define GPIOI_BASE 0x40022000u
#define TIM4_BASE 0x40000800u
#define TIM5_BASE 0x40000C00u
#define CAN1_BASE 0x40006400u
#define USART2_BASE 0x40004400u
#define SPI5_BASE 0x40015000u

#define GPIO_MODER(base) (*(volatile uint32_t *)((base) + 0x00u))
#define GPIO_OTYPER(base) (*(volatile uint32_t *)((base) + 0x04u))
#define GPIO_OSPEEDR(base) (*(volatile uint32_t *)((base) + 0x08u))
#define GPIO_PUPDR(base) (*(volatile uint32_t *)((base) + 0x0Cu))
#define GPIO_IDR(base) (*(volatile uint32_t *)((base) + 0x10u))
#define GPIO_BSRR(base) (*(volatile uint32_t *)((base) + 0x18u))
#define GPIO_AFRL(base) (*(volatile uint32_t *)((base) + 0x20u))
#define GPIO_AFRH(base) (*(volatile uint32_t *)((base) + 0x24u))

#define TIM_CR1(base) (*(volatile uint32_t *)((base) + 0x00u))
#define TIM_SMCR(base) (*(volatile uint32_t *)((base) + 0x08u))
#define TIM_EGR(base) (*(volatile uint32_t *)((base) + 0x14u))
#define TIM_CCMR1(base) (*(volatile uint32_t *)((base) + 0x18u))
#define TIM_CCMR2(base) (*(volatile uint32_t *)((base) + 0x1Cu))
#define TIM_CCER(base) (*(volatile uint32_t *)((base) + 0x20u))
#define TIM_CNT(base) (*(volatile uint32_t *)((base) + 0x24u))
#define TIM_PSC(base) (*(volatile uint32_t *)((base) + 0x28u))
#define TIM_ARR(base) (*(volatile uint32_t *)((base) + 0x2Cu))
#define TIM_CCR1(base) (*(volatile uint32_t *)((base) + 0x34u))
#define TIM_CCR2(base) (*(volatile uint32_t *)((base) + 0x38u))
#define TIM_CCR3(base) (*(volatile uint32_t *)((base) + 0x3Cu))
#define TIM_CCR4(base) (*(volatile uint32_t *)((base) + 0x40u))

#define USART_SR(base) (*(volatile uint32_t *)((base) + 0x00u))
#define USART_DR(base) (*(volatile uint32_t *)((base) + 0x04u))
#define USART_BRR(base) (*(volatile uint32_t *)((base) + 0x08u))
#define USART_CR1(base) (*(volatile uint32_t *)((base) + 0x0Cu))

#define SPI_CR1(base) (*(volatile uint32_t *)((base) + 0x00u))
#define SPI_SR(base) (*(volatile uint32_t *)((base) + 0x08u))
#define SPI_DR(base) (*(volatile uint32_t *)((base) + 0x0Cu))

#define CAN_MCR(base) (*(volatile uint32_t *)((base) + 0x00u))
#define CAN_MSR(base) (*(volatile uint32_t *)((base) + 0x04u))
#define CAN_TSR(base) (*(volatile uint32_t *)((base) + 0x08u))
#define CAN_RF0R(base) (*(volatile uint32_t *)((base) + 0x0Cu))
#define CAN_ESR(base) (*(volatile uint32_t *)((base) + 0x18u))
#define CAN_BTR(base) (*(volatile uint32_t *)((base) + 0x1Cu))
#define CAN_TIR(base, mailbox) (*(volatile uint32_t *)((base) + 0x180u + ((mailbox) * 0x10u)))
#define CAN_TDTR(base, mailbox) (*(volatile uint32_t *)((base) + 0x184u + ((mailbox) * 0x10u)))
#define CAN_TDLR(base, mailbox) (*(volatile uint32_t *)((base) + 0x188u + ((mailbox) * 0x10u)))
#define CAN_TDHR(base, mailbox) (*(volatile uint32_t *)((base) + 0x18Cu + ((mailbox) * 0x10u)))
#define CAN_RIR(base) (*(volatile uint32_t *)((base) + 0x1B0u))
#define CAN_RDTR(base) (*(volatile uint32_t *)((base) + 0x1B4u))
#define CAN_RDLR(base) (*(volatile uint32_t *)((base) + 0x1B8u))
#define CAN_RDHR(base) (*(volatile uint32_t *)((base) + 0x1BCu))
#define CAN_FMR(base) (*(volatile uint32_t *)((base) + 0x200u))
#define CAN_FM1R(base) (*(volatile uint32_t *)((base) + 0x204u))
#define CAN_FS1R(base) (*(volatile uint32_t *)((base) + 0x20Cu))
#define CAN_FFA1R(base) (*(volatile uint32_t *)((base) + 0x214u))
#define CAN_FA1R(base) (*(volatile uint32_t *)((base) + 0x21Cu))
#define CAN_FR1(base, bank) (*(volatile uint32_t *)((base) + 0x240u + ((bank) * 0x8u)))
#define CAN_FR2(base, bank) (*(volatile uint32_t *)((base) + 0x244u + ((bank) * 0x8u)))

#define SYST_CSR (*(volatile uint32_t *)0xE000E010u)
#define SYST_RVR (*(volatile uint32_t *)0xE000E014u)
#define SYST_CVR (*(volatile uint32_t *)0xE000E018u)

#define PWM_PERIOD_COUNTS 799u
#define MOTOR_COUNT 8u
#define MOTOR_SUPPORT_MESSAGE "A board firmware supports M1-M8"
#define ENCODER_PPR 13u
#define ENCODER_QUADRATURE_MULTIPLIER 4u
#define ENCODER_TICKS_PER_REV_DEFAULT (ENCODER_PPR * ENCODER_QUADRATURE_MULTIPLIER)
#define CLOSED_LOOP_UPDATE_MS 50u
#define CLOSED_LOOP_MAX_RPM_DEFAULT 6000u
#define CLOSED_LOOP_MAX_RPM_LIMIT 30000u
#define CLOSED_LOOP_KP_DIV 120
#define CLOSED_LOOP_KI_DIV 3000
#define CLOSED_LOOP_INTEGRAL_LIMIT_RPM 20000
#define CLOSED_LOOP_RPM_DEADBAND 30
#define ENCODER_MIN_SAMPLE_MS 10u
#define RX_LINE_SIZE 256u
#define RX_BINARY_SIZE 96u
#define CAN_STD_ID_MAX 0x7FFu
#define CAN_EXT_ID_MAX 0x1FFFFFFFu
#define CAN_MAX_DLC 8u
#define CAN_TX_TIMEOUT_MS 30u
#define CAN_STATUS_RX_DRAIN_MAX 8u
#define MOTION_APPLY_INTERVAL_MS 20u
#define COMMAND_PRIORITY_STOP 100
#define COMMAND_PRIORITY_MOTOR 80
#define COMMAND_PRIORITY_ARM_SERVO 60
#define COMMAND_PRIORITY_CAN_SERVO 40
#define COMMAND_PRIORITY_TELEMETRY 20
#define BINARY_PROTOCOL_VERSION 1u
#define BINARY_TARGET_SYSTEM 0x00u
#define BINARY_TARGET_BASE 0x01u
#define BINARY_TARGET_MOTOR 0x02u
#define BINARY_TARGET_CAN_SERVO_GROUP 0x03u
#define BINARY_TARGET_CAN_SERVO 0x04u
#define BINARY_TARGET_IMU 0x05u
#define BINARY_OPCODE_STOP 0x10u
#define BINARY_OPCODE_MECANUM_VELOCITY 0x11u
#define BINARY_OPCODE_MOTOR_TARGET 0x20u
#define BINARY_OPCODE_CAN_SERVO_GROUP_MOVE 0x30u
#define BINARY_OPCODE_CAN_SERVO_READ 0x31u
#define BINARY_OPCODE_IMU_READ 0x40u
#define BINARY_OPCODE_SYSTEM_PING 0x70u
#define BINARY_OPCODE_SYNC_MANIFEST_VERSION 0x71u
#define BINARY_FLAG_LATEST_WINS 0x01u
#define BINARY_FLAG_REQUIRES_ACK 0x02u
#define BINARY_FLAG_PRIORITY 0x04u
#define CAN_SERVO_GROUP_MAX_TARGETS 8u
#define ASMG_MD_HOST_EXTENDED_ID 0x18EF0201u
#define ASMG_MD_BROADCAST_ID 0xFEu
#define ASMG_MD_POSITION_MIN 0x0000
#define ASMG_MD_POSITION_MAX 0x7FFF
#define ASMG_MD_SPEED_MIN 0x0000
#define ASMG_MD_SPEED_MAX 0x0500
#define ASMG_MD_CENTER_RATIO_MIN 0x0000
#define ASMG_MD_CENTER_RATIO_MAX 0x03E8
#define ASMG_MD_BAUD_250_CODE 0u
#define ASMG_MD_BAUD_500_CODE 1u
#define ASMG_MD_BAUD_1000_CODE 2u
#define MPU_WHO_AM_I_REG 0x75u
#define MPU_PWR_MGMT_1_REG 0x6Bu
#define MPU_CONFIG_REG 0x1Au
#define MPU_GYRO_CONFIG_REG 0x1Bu
#define MPU_ACCEL_CONFIG_REG 0x1Cu
#define MPU_ACCEL_CONFIG2_REG 0x1Du
#define MPU_USER_CTRL_REG 0x6Au
#define MPU_I2C_MST_CTRL_REG 0x24u
#define MPU_I2C_MST_STATUS_REG 0x36u
#define MPU_I2C_SLV4_ADDR_REG 0x31u
#define MPU_I2C_SLV4_REG_REG 0x32u
#define MPU_I2C_SLV4_DO_REG 0x33u
#define MPU_I2C_SLV4_CTRL_REG 0x34u
#define MPU_I2C_SLV4_DI_REG 0x35u
#define MPU_ACCEL_XOUT_H_REG 0x3Bu
#define IST8310_ADDR 0x0Eu
#define IST8310_WAI_REG 0x00u
#define IST8310_DATA_X_L_REG 0x03u
#define IST8310_CTRL1_REG 0x0Au
#define IST8310_CTRL2_REG 0x0Bu
#define IST8310_AVGCNTL_REG 0x41u
#define IST8310_PDCTNL_REG 0x42u

typedef struct {
  int16_t accel_x;
  int16_t accel_y;
  int16_t accel_z;
  int16_t gyro_x;
  int16_t gyro_y;
  int16_t gyro_z;
  int16_t mag_x;
  int16_t mag_y;
  int16_t mag_z;
  int16_t temp;
  uint32_t mpu_whoami;
  uint32_t ist_whoami;
  uint32_t sample_ms;
} ImuSample;

typedef struct {
  uintptr_t port;
  uint32_t pin;
} GpioPin;

typedef struct {
  uintptr_t timer;
  uint32_t channel;
  GpioPin gpio;
} PwmPinConfig;

typedef struct {
  const char *channel;
  uintptr_t pwm_timer;
  uint32_t pwm_channel;
  uintptr_t pwm_port;
  uint32_t pwm_pin;
  uintptr_t in1_port;
  uint32_t in1_pin;
  uintptr_t in2_port;
  uint32_t in2_pin;
  uintptr_t enable_port;
  uint32_t enable_pin;
  uint32_t has_enable;
  uintptr_t encoder_a_port;
  uint32_t encoder_a_pin;
  uintptr_t encoder_b_port;
  uint32_t encoder_b_pin;
  uint32_t has_encoder;
} MotorPins;

typedef struct {
  uint32_t configured;
  int32_t commanded_speed_percent;
  uint32_t duty_percent;
  const char *direction;
  const char *stop_mode;
  uint32_t encoder_sample_valid;
  int32_t last_encoder_ticks;
  uint32_t last_encoder_ms;
  uint32_t pulse_hz;
  int32_t encoder_delta;
  const char *encoder_direction;
  uint32_t encoder_ticks_per_rev;
  uint32_t speed_rpm;
  uint32_t closed_loop_enabled;
  uint32_t closed_loop_max_rpm;
  uint32_t closed_loop_last_ms;
  int32_t target_rpm;
  int32_t control_error_rpm;
  int32_t control_integral_rpm;
  uint32_t control_duty_percent;
  int32_t encoder_ticks;
  uint32_t encoder_last_state;
} MotorRuntime;

typedef enum {
  MOTION_NONE = 0,
  MOTION_MOTOR_TARGET = 1,
  MOTION_MECANUM_TARGET = 2,
  MOTION_CAN_SERVO_MOVE = 3,
  MOTION_CAN_SERVO_GROUP_MOVE = 4
} PendingMotionKind;

typedef struct {
  int32_t id;
  int32_t position;
} CanServoMotionTarget;

typedef struct {
  PendingMotionKind kind;
  int32_t seq;
  int32_t priority;
  int32_t motor_index;
  int32_t speed_percent;
  char stop_mode[8];
  uint32_t closed_loop;
  uint32_t closed_loop_set;
  int32_t target_rpm;
  int32_t forward_milli;
  int32_t strafe_milli;
  int32_t turn_milli;
  int32_t speed_limit_percent;
  int32_t can_servo_id;
  int32_t can_servo_position;
  int32_t can_servo_speed;
  uint32_t can_servo_count;
  CanServoMotionTarget can_servo_targets[CAN_SERVO_GROUP_MAX_TARGETS];
} PendingMotion;

static volatile uint32_t g_ms;

static MotorPins motor_pins[MOTOR_COUNT] = {
  { "M1", TIM4_BASE, 3u, GPIOD_BASE, 14u, GPIOB_BASE, 1u, GPIOC_BASE, 0u, GPIOI_BASE, 0u, 1u, GPIOC_BASE, 1u, GPIOA_BASE, 4u, 1u },
  { "M2", TIM4_BASE, 2u, GPIOD_BASE, 13u, GPIOF_BASE, 0u, GPIOE_BASE, 4u, GPIOI_BASE, 0u, 1u, GPIOE_BASE, 12u, GPIOB_BASE, 0u, 1u },
  { "M3", TIM4_BASE, 4u, GPIOD_BASE, 15u, GPIOI_BASE, 5u, GPIOI_BASE, 6u, GPIOH_BASE, 12u, 1u, GPIOI_BASE, 7u, GPIOI_BASE, 2u, 1u },
  { "M4", TIM5_BASE, 2u, GPIOH_BASE, 11u, GPIOC_BASE, 3u, GPIOC_BASE, 4u, GPIOH_BASE, 12u, 1u, GPIOC_BASE, 5u, GPIOA_BASE, 5u, 1u },
  { "M5", TIM5_BASE, 1u, GPIOH_BASE, 10u, GPIOA_BASE, 0u, GPIOA_BASE, 1u, GPIOH_BASE, 12u, 1u, GPIOA_BASE, 2u, GPIOA_BASE, 3u, 1u },
  { "M6", TIM4_BASE, 1u, GPIOD_BASE, 12u, GPIOF_BASE, 1u, GPIOE_BASE, 5u, GPIOI_BASE, 0u, 1u, GPIOE_BASE, 6u, GPIOC_BASE, 2u, 1u },
  { "M7", 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u },
  { "M8", 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u }
};

static MotorRuntime motors[MOTOR_COUNT];
static PendingMotion pending_motion;
static uint32_t motion_pending;
static uint32_t dropped_motion_count;
static int32_t latest_motion_seq = -1;
static uint32_t last_motion_apply_ms;
static const char *active_command = "idle";
static int32_t mecanum_direction[MOTOR_COUNT] = { 1, 1, 1, 1, 1, 1, 1, 1 };
static uint32_t mecanum_closed_loop = 1;
static uint32_t mecanum_max_rpm = CLOSED_LOOP_MAX_RPM_DEFAULT;
static uint32_t mecanum_encoder_ticks_per_rev = ENCODER_TICKS_PER_REV_DEFAULT;
static const uint32_t mecanum_channel_map[4] = { 0, 1, 2, 3 };
static uint32_t system_core_hz = 16000000u;
static uint32_t debug_enabled;
static uint32_t can_ready;
static uint32_t can_bitrate_kbps = 250;
static uint32_t can_tx_ok;
static uint32_t can_tx_error;
static uint32_t can_tx_timeout;
static uint32_t imu_initialized;
static uint32_t imu_ready;
static uint32_t imu_mpu_whoami;
static uint32_t imu_ist_whoami;
static uint32_t binary_frames_in;
static uint32_t binary_crc_error;
static uint32_t binary_cobs_error;
static uint32_t binary_drop_count;

void SysTick_Handler(void) {
  g_ms++;
}

static uint32_t millis(void) {
  return g_ms;
}

static void delay_ms(uint32_t ms) {
  const uint32_t start = millis();
  while ((uint32_t)(millis() - start) < ms) {
  }
}

static uint32_t init_hse_clock_12mhz(void) {
  uint32_t timeout = 1200000u;
  RCC_CR |= (1u << 16);
  while ((RCC_CR & (1u << 17)) == 0u && timeout > 0u) {
    timeout--;
  }
  if ((RCC_CR & (1u << 17)) == 0u) {
    system_core_hz = 16000000u;
    return 0;
  }
  RCC_CFGR = (RCC_CFGR & ~3u) | 1u;
  timeout = 1200000u;
  while (((RCC_CFGR >> 2) & 3u) != 1u && timeout > 0u) {
    timeout--;
  }
  if (((RCC_CFGR >> 2) & 3u) != 1u) {
    system_core_hz = 16000000u;
    return 0;
  }
  system_core_hz = 12000000u;
  return 1;
}

static void gpio_output(uintptr_t port, uint32_t pin) {
  const uint32_t shift = pin * 2u;
  GPIO_MODER(port) = (GPIO_MODER(port) & ~(3u << shift)) | (1u << shift);
  GPIO_OTYPER(port) &= ~(1u << pin);
  GPIO_OSPEEDR(port) = (GPIO_OSPEEDR(port) & ~(3u << shift)) | (2u << shift);
  GPIO_PUPDR(port) &= ~(3u << shift);
}

static void gpio_input_pullup(uintptr_t port, uint32_t pin) {
  const uint32_t shift = pin * 2u;
  GPIO_MODER(port) &= ~(3u << shift);
  GPIO_PUPDR(port) = (GPIO_PUPDR(port) & ~(3u << shift)) | (1u << shift);
}

static void gpio_alt(uintptr_t port, uint32_t pin, uint32_t af, uint32_t pull) {
  const uint32_t mode_shift = pin * 2u;
  const uint32_t af_shift = (pin & 7u) * 4u;
  GPIO_MODER(port) = (GPIO_MODER(port) & ~(3u << mode_shift)) | (2u << mode_shift);
  GPIO_OTYPER(port) &= ~(1u << pin);
  GPIO_OSPEEDR(port) = (GPIO_OSPEEDR(port) & ~(3u << mode_shift)) | (2u << mode_shift);
  GPIO_PUPDR(port) = (GPIO_PUPDR(port) & ~(3u << mode_shift)) | ((pull & 3u) << mode_shift);
  if (pin < 8u) {
    GPIO_AFRL(port) = (GPIO_AFRL(port) & ~(0xFu << af_shift)) | (af << af_shift);
  } else {
    GPIO_AFRH(port) = (GPIO_AFRH(port) & ~(0xFu << af_shift)) | (af << af_shift);
  }
}

static void gpio_high(uintptr_t port, uint32_t pin) {
  GPIO_BSRR(port) = (1u << pin);
}

static void gpio_low(uintptr_t port, uint32_t pin) {
  GPIO_BSRR(port) = (1u << (pin + 16u));
}

static uint8_t spi5_transfer(uint8_t value) {
  while ((SPI_SR(SPI5_BASE) & (1u << 1)) == 0u) {
  }
  SPI_DR(SPI5_BASE) = value;
  while ((SPI_SR(SPI5_BASE) & 1u) == 0u) {
  }
  return (uint8_t)(SPI_DR(SPI5_BASE) & 0xFFu);
}

static void mpu_select(void) {
  gpio_low(GPIOF_BASE, 6);
}

static void mpu_deselect(void) {
  while (SPI_SR(SPI5_BASE) & (1u << 7)) {
  }
  gpio_high(GPIOF_BASE, 6);
}

static void mpu_write_reg(uint8_t reg, uint8_t value) {
  mpu_select();
  (void)spi5_transfer(reg & 0x7Fu);
  (void)spi5_transfer(value);
  mpu_deselect();
}

static uint8_t mpu_read_reg(uint8_t reg) {
  uint8_t value;
  mpu_select();
  (void)spi5_transfer(reg | 0x80u);
  value = spi5_transfer(0xFFu);
  mpu_deselect();
  return value;
}

static void mpu_read_bytes(uint8_t reg, uint8_t *out, uint32_t len) {
  mpu_select();
  (void)spi5_transfer(reg | 0x80u);
  for (uint32_t i = 0; i < len; ++i) {
    out[i] = spi5_transfer(0xFFu);
  }
  mpu_deselect();
}

static uint32_t mpu_i2c_wait_slv4(uint32_t timeout_ms) {
  const uint32_t start = millis();
  while ((uint32_t)(millis() - start) <= timeout_ms) {
    const uint8_t status = mpu_read_reg(MPU_I2C_MST_STATUS_REG);
    if (status & (1u << 6)) {
      return (status & ((1u << 5) | (1u << 4))) == 0u;
    }
  }
  return 0;
}

static uint32_t ist8310_write_reg(uint8_t reg, uint8_t value) {
  mpu_write_reg(MPU_I2C_SLV4_ADDR_REG, IST8310_ADDR);
  mpu_write_reg(MPU_I2C_SLV4_REG_REG, reg);
  mpu_write_reg(MPU_I2C_SLV4_DO_REG, value);
  mpu_write_reg(MPU_I2C_SLV4_CTRL_REG, 0x80u);
  delay_ms(1);
  return mpu_i2c_wait_slv4(20);
}

static uint32_t ist8310_read_reg(uint8_t reg, uint8_t *out) {
  mpu_write_reg(MPU_I2C_SLV4_ADDR_REG, 0x80u | IST8310_ADDR);
  mpu_write_reg(MPU_I2C_SLV4_REG_REG, reg);
  mpu_write_reg(MPU_I2C_SLV4_CTRL_REG, 0x80u);
  delay_ms(1);
  if (!mpu_i2c_wait_slv4(20)) {
    return 0;
  }
  *out = mpu_read_reg(MPU_I2C_SLV4_DI_REG);
  return 1;
}

static int16_t be_i16(uint8_t high, uint8_t low) {
  return (int16_t)((uint16_t)(((uint16_t)high << 8) | low));
}

static int16_t le_i16(uint8_t low, uint8_t high) {
  return (int16_t)((uint16_t)(((uint16_t)high << 8) | low));
}

static void init_spi5_mpu6500(void) {
  RCC_APB2ENR |= (1u << 20);
  (void)RCC_APB2ENR;

  gpio_output(GPIOF_BASE, 6);
  gpio_high(GPIOF_BASE, 6);
  gpio_alt(GPIOF_BASE, 7, 5, 0);
  gpio_alt(GPIOF_BASE, 8, 5, 0);
  gpio_alt(GPIOF_BASE, 9, 5, 0);

  SPI_CR1(SPI5_BASE) = 0;
  SPI_CR1(SPI5_BASE) = (1u << 0) | (1u << 1) | (1u << 2) | (5u << 3) | (1u << 6) | (1u << 8) | (1u << 9);
}

static uint32_t init_imu(void) {
  uint8_t ist_whoami = 0;
  init_spi5_mpu6500();
  delay_ms(5);

  imu_mpu_whoami = mpu_read_reg(MPU_WHO_AM_I_REG);
  if (imu_mpu_whoami == 0u || imu_mpu_whoami == 0xFFu) {
    imu_initialized = 1;
    imu_ready = 0;
    return 0;
  }

  mpu_write_reg(MPU_PWR_MGMT_1_REG, 0x80u);
  delay_ms(100);
  mpu_write_reg(MPU_PWR_MGMT_1_REG, 0x01u);
  delay_ms(10);
  mpu_write_reg(MPU_CONFIG_REG, 0x03u);
  mpu_write_reg(MPU_GYRO_CONFIG_REG, 0x18u);
  mpu_write_reg(MPU_ACCEL_CONFIG_REG, 0x10u);
  mpu_write_reg(MPU_ACCEL_CONFIG2_REG, 0x03u);
  mpu_write_reg(MPU_USER_CTRL_REG, 0x30u);
  delay_ms(5);
  mpu_write_reg(MPU_I2C_MST_CTRL_REG, 0x0Du);
  delay_ms(5);

  imu_mpu_whoami = mpu_read_reg(MPU_WHO_AM_I_REG);
  (void)ist8310_write_reg(IST8310_CTRL2_REG, 0x01u);
  delay_ms(10);
  (void)ist8310_write_reg(IST8310_AVGCNTL_REG, 0x24u);
  (void)ist8310_write_reg(IST8310_PDCTNL_REG, 0xC0u);
  if (ist8310_read_reg(IST8310_WAI_REG, &ist_whoami)) {
    imu_ist_whoami = ist_whoami;
  } else {
    imu_ist_whoami = 0;
  }

  imu_initialized = 1;
  imu_ready = 1;
  return 1;
}

static uint32_t read_imu_sample(ImuSample *sample, const char **error) {
  uint8_t data[14];
  uint8_t mag[6] = { 0 };
  uint8_t ist_whoami = 0;
  uint32_t mag_ok = 0;

  if (!imu_initialized || !imu_ready) {
    (void)init_imu();
  }

  sample->accel_x = 0;
  sample->accel_y = 0;
  sample->accel_z = 0;
  sample->gyro_x = 0;
  sample->gyro_y = 0;
  sample->gyro_z = 0;
  sample->mag_x = 0;
  sample->mag_y = 0;
  sample->mag_z = 0;
  sample->temp = 0;
  sample->mpu_whoami = imu_mpu_whoami;
  sample->ist_whoami = imu_ist_whoami;
  sample->sample_ms = millis();
  *error = 0;

  if (!imu_ready) {
    *error = "mpu_unavailable";
    return 0;
  }

  mpu_read_bytes(MPU_ACCEL_XOUT_H_REG, data, sizeof(data));
  sample->accel_x = be_i16(data[0], data[1]);
  sample->accel_y = be_i16(data[2], data[3]);
  sample->accel_z = be_i16(data[4], data[5]);
  sample->temp = be_i16(data[6], data[7]);
  sample->gyro_x = be_i16(data[8], data[9]);
  sample->gyro_y = be_i16(data[10], data[11]);
  sample->gyro_z = be_i16(data[12], data[13]);

  if (ist8310_read_reg(IST8310_WAI_REG, &ist_whoami)) {
    imu_ist_whoami = ist_whoami;
    sample->ist_whoami = ist_whoami;
  }

  if (sample->ist_whoami == 0x10u && ist8310_write_reg(IST8310_CTRL1_REG, 0x01u)) {
    delay_ms(6);
    mag_ok = 1;
    for (uint32_t i = 0; i < sizeof(mag); ++i) {
      if (!ist8310_read_reg((uint8_t)(IST8310_DATA_X_L_REG + i), &mag[i])) {
        mag_ok = 0;
        break;
      }
    }
  }

  if (mag_ok) {
    sample->mag_x = le_i16(mag[0], mag[1]);
    sample->mag_y = le_i16(mag[2], mag[3]);
    sample->mag_z = le_i16(mag[4], mag[5]);
  } else if (sample->ist_whoami == 0x10u) {
    *error = "ist_timeout";
  } else {
    *error = "ist_unavailable";
  }

  return 1;
}

static void led_green(uint32_t on) {
  if (on) {
    gpio_low(GPIOF_BASE, 14);
  } else {
    gpio_high(GPIOF_BASE, 14);
  }
}

static void led_red(uint32_t on) {
  if (on) {
    gpio_low(GPIOE_BASE, 11);
  } else {
    gpio_high(GPIOE_BASE, 11);
  }
}

static void uart_write_char(char value) {
  while ((USART_SR(USART2_BASE) & (1u << 7)) == 0u) {
  }
  USART_DR(USART2_BASE) = (uint32_t)(uint8_t)value;
}

static void uart_write_str(const char *text) {
  while (*text) {
    uart_write_char(*text++);
  }
}

static int32_t uart_read_char(void) {
  if ((USART_SR(USART2_BASE) & (1u << 5)) == 0u) {
    return -1;
  }
  return (int32_t)(USART_DR(USART2_BASE) & 0xFFu);
}

static void uart_write_i32(int32_t value) {
  char buffer[12];
  uint32_t index = 0;
  uint32_t magnitude;
  if (value < 0) {
    uart_write_char('-');
    magnitude = (uint32_t)(-value);
  } else {
    magnitude = (uint32_t)value;
  }
  do {
    buffer[index++] = (char)('0' + (magnitude % 10u));
    magnitude /= 10u;
  } while (magnitude && index < sizeof(buffer));
  while (index) {
    uart_write_char(buffer[--index]);
  }
}

static void uart_write_u32(uint32_t value) {
  char buffer[10];
  uint32_t index = 0;
  do {
    buffer[index++] = (char)('0' + (value % 10u));
    value /= 10u;
  } while (value && index < sizeof(buffer));
  while (index) {
    uart_write_char(buffer[--index]);
  }
}

static void uart_write_hex_byte(uint32_t value) {
  static const char hex[] = "0123456789ABCDEF";
  uart_write_char(hex[(value >> 4) & 0xFu]);
  uart_write_char(hex[value & 0xFu]);
}

static uint16_t read_u16_le(const uint8_t *data) {
  return (uint16_t)(((uint16_t)data[1] << 8) | data[0]);
}

static int16_t read_i16_le(const uint8_t *data) {
  return (int16_t)read_u16_le(data);
}

static const char *stop_mode_from_code(uint8_t code) {
  return code ? "brake" : "coast";
}

static uint16_t crc16_ccitt_false(const uint8_t *data, uint32_t length) {
  uint16_t crc = 0xFFFFu;
  for (uint32_t index = 0; index < length; index++) {
    crc ^= (uint16_t)data[index] << 8;
    for (uint32_t bit = 0; bit < 8u; bit++) {
      if (crc & 0x8000u) {
        crc = (uint16_t)((crc << 1) ^ 0x1021u);
      } else {
        crc = (uint16_t)(crc << 1);
      }
    }
  }
  return crc;
}

static uint32_t cobs_decode(const uint8_t *input, uint32_t input_len, uint8_t *output, uint32_t output_max, uint32_t *output_len) {
  uint32_t read_index = 0;
  uint32_t write_index = 0;
  while (read_index < input_len) {
    const uint8_t code = input[read_index++];
    if (code == 0u) {
      return 0;
    }
    for (uint32_t offset = 1; offset < code; offset++) {
      if (read_index >= input_len || write_index >= output_max) {
        return 0;
      }
      output[write_index++] = input[read_index++];
    }
    if (code < 0xFFu && read_index < input_len) {
      if (write_index >= output_max) {
        return 0;
      }
      output[write_index++] = 0;
    }
  }
  *output_len = write_index;
  return 1;
}

static uint32_t str_eq(const char *left, const char *right) {
  while (*left && *right && *left == *right) {
    left++;
    right++;
  }
  return *left == 0 && *right == 0;
}

static char upper_char(char value) {
  if (value >= 'a' && value <= 'z') {
    return (char)(value - ('a' - 'A'));
  }
  return value;
}

static uint32_t str_ieq(const char *left, const char *right) {
  while (*left && *right && upper_char(*left) == upper_char(*right)) {
    left++;
    right++;
  }
  return *left == 0 && *right == 0;
}

static const char *find_key(const char *json, const char *key) {
  while (*json) {
    const char *cursor = json;
    const char *needle = key;
    if (*cursor == '"') {
      cursor++;
      while (*cursor && *needle && *cursor == *needle) {
        cursor++;
        needle++;
      }
      if (*needle == 0 && *cursor == '"') {
        cursor++;
        while (*cursor == ' ' || *cursor == '\t' || *cursor == '\r' || *cursor == '\n') {
          cursor++;
        }
        if (*cursor == ':') {
          cursor++;
          while (*cursor == ' ' || *cursor == '\t' || *cursor == '\r' || *cursor == '\n') {
            cursor++;
          }
          return cursor;
        }
      }
    }
    json++;
  }
  return 0;
}

static uint32_t json_string(const char *json, const char *key, char *out, uint32_t out_size) {
  const char *value = find_key(json, key);
  uint32_t index = 0;
  if (!value || *value != '"' || out_size == 0u) {
    return 0;
  }
  value++;
  while (*value && *value != '"' && index + 1u < out_size) {
    out[index++] = *value++;
  }
  out[index] = 0;
  return *value == '"';
}

static uint32_t json_int(const char *json, const char *key, int32_t *out) {
  const char *value = find_key(json, key);
  int32_t sign = 1;
  int32_t result = 0;
  uint32_t found = 0;
  if (!value) {
    return 0;
  }
  if (*value == '-') {
    sign = -1;
    value++;
  }
  while (*value >= '0' && *value <= '9') {
    result = result * 10 + (*value - '0');
    found = 1;
    value++;
  }
  if (found) {
    *out = result * sign;
  }
  return found;
}

static uint32_t json_bool(const char *json, const char *key, uint32_t *out) {
  const char *value = find_key(json, key);
  if (!value) {
    return 0;
  }
  if (value[0] == 't' && value[1] == 'r' && value[2] == 'u' && value[3] == 'e') {
    *out = 1;
    return 1;
  }
  if (value[0] == 'f' && value[1] == 'a' && value[2] == 'l' && value[3] == 's' && value[4] == 'e') {
    *out = 0;
    return 1;
  }
  return 0;
}

static int32_t clamp_i32(int32_t value, int32_t min, int32_t max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

static int32_t abs_i32(int32_t value) {
  return value < 0 ? -value : value;
}

static int32_t divide_round_i32(int32_t numerator, int32_t denominator) {
  if (denominator <= 0) {
    return 0;
  }
  if (numerator >= 0) {
    return (numerator + denominator / 2) / denominator;
  }
  return -((-numerator + denominator / 2) / denominator);
}

static uint32_t json_int_or(const char *json, const char *key, int32_t *out, int32_t fallback) {
  if (json_int(json, key, out)) {
    return 1;
  }
  *out = fallback;
  return 0;
}

static uint32_t json_milli_or(const char *json, const char *key, int32_t *out, int32_t fallback) {
  const char *value = find_key(json, key);
  int32_t sign = 1;
  int32_t whole = 0;
  int32_t frac = 0;
  int32_t scale = 100;
  uint32_t found = 0;
  if (!value) {
    *out = fallback;
    return 0;
  }
  if (*value == '-') {
    sign = -1;
    value++;
  }
  while (*value >= '0' && *value <= '9') {
    whole = whole * 10 + (*value - '0');
    found = 1;
    value++;
  }
  if (*value == '.') {
    value++;
    while (*value >= '0' && *value <= '9' && scale > 0) {
      frac += (*value - '0') * scale;
      scale /= 10;
      found = 1;
      value++;
    }
  }
  if (!found) {
    *out = fallback;
    return 0;
  }
  *out = sign * ((whole * 1000) + frac);
  return 1;
}

typedef struct {
  const char *alias;
  const char *pin;
} BoardPinAlias;

static const BoardPinAlias board_pin_aliases[] = {
  { "A", "PI0" },
  { "B", "PH12" },
  { "C", "PH11" },
  { "D", "PH10" },
  { "E", "PD15" },
  { "F", "PD14" },
  { "G", "PD13" },
  { "H", "PD12" },
  { "I1", "PF1" },
  { "I2", "PF0" },
  { "J1", "PE5" },
  { "J2", "PE4" },
  { "K1", "PE6" },
  { "K2", "PE12" },
  { "L1", "PC2" },
  { "L2", "PB0" },
  { "M1", "PC3" },
  { "M2", "PB1" },
  { "N1", "PC4" },
  { "N2", "PC0" },
  { "O1", "PC5" },
  { "O2", "PC1" },
  { "P1", "PA5" },
  { "P2", "PA4" },
  { "Q1", "PF10" },
  { "Q2", "PI9" },
  { "S", "PA0" },
  { "T", "PA1" },
  { "U", "PA2" },
  { "V", "PA3" },
  { "W", "PI5" },
  { "X", "PI6" },
  { "Y", "PI7" },
  { "Z", "PI2" }
};

static uint32_t gpio_port_from_letter(char letter, uintptr_t *port) {
  switch (upper_char(letter)) {
    case 'A': *port = GPIOA_BASE; return 1;
    case 'B': *port = GPIOB_BASE; return 1;
    case 'C': *port = GPIOC_BASE; return 1;
    case 'D': *port = GPIOD_BASE; return 1;
    case 'E': *port = GPIOE_BASE; return 1;
    case 'F': *port = GPIOF_BASE; return 1;
    case 'G': *port = GPIOG_BASE; return 1;
    case 'H': *port = GPIOH_BASE; return 1;
    case 'I': *port = GPIOI_BASE; return 1;
    default: return 0;
  }
}

static uint32_t parse_gpio_pin_name(const char *name, GpioPin *pin) {
  uintptr_t port = 0;
  uint32_t number = 0;
  uint32_t found_digit = 0;
  const char *cursor;
  if (!name || upper_char(name[0]) != 'P' || !gpio_port_from_letter(name[1], &port)) {
    return 0;
  }
  cursor = name + 2;
  while (*cursor >= '0' && *cursor <= '9') {
    number = number * 10u + (uint32_t)(*cursor - '0');
    found_digit = 1;
    cursor++;
  }
  if (!found_digit || *cursor != 0 || number > 15u) {
    return 0;
  }
  pin->port = port;
  pin->pin = number;
  return 1;
}

static uint32_t parse_board_pin(const char *name, GpioPin *pin) {
  if (parse_gpio_pin_name(name, pin)) {
    return 1;
  }
  for (uint32_t index = 0; index < (uint32_t)(sizeof(board_pin_aliases) / sizeof(board_pin_aliases[0])); index++) {
    if (str_ieq(name, board_pin_aliases[index].alias)) {
      return parse_gpio_pin_name(board_pin_aliases[index].pin, pin);
    }
  }
  return 0;
}

static uint32_t parse_pwm_pin(const char *name, PwmPinConfig *pwm) {
  GpioPin gpio = { 0u, 0u };
  if (!parse_board_pin(name, &gpio)) {
    return 0;
  }
  if (gpio.port == GPIOD_BASE && gpio.pin >= 12u && gpio.pin <= 15u) {
    pwm->timer = TIM4_BASE;
    pwm->channel = gpio.pin - 11u;
    pwm->gpio = gpio;
    return 1;
  }
  if (gpio.port == GPIOA_BASE && gpio.pin <= 3u) {
    pwm->timer = TIM5_BASE;
    pwm->channel = gpio.pin + 1u;
    pwm->gpio = gpio;
    return 1;
  }
  if (gpio.port == GPIOH_BASE && gpio.pin >= 10u && gpio.pin <= 12u) {
    pwm->timer = TIM5_BASE;
    pwm->channel = gpio.pin - 9u;
    pwm->gpio = gpio;
    return 1;
  }
  if (gpio.port == GPIOI_BASE && gpio.pin == 0u) {
    pwm->timer = TIM5_BASE;
    pwm->channel = 4u;
    pwm->gpio = gpio;
    return 1;
  }
  return 0;
}

static int32_t motor_index_from_channel(const char *channel) {
  if ((channel[0] == 'M' || channel[0] == 'm') && channel[1] >= '1' && channel[1] <= '8' && channel[2] == 0) {
    return (int32_t)(channel[1] - '1');
  }
  return -1;
}

static int32_t motor_index_from_json(const char *json) {
  char channel[8];
  if (!json_string(json, "channel", channel, sizeof(channel))) {
    return -1;
  }
  return motor_index_from_channel(channel);
}

static uint32_t motor_pins_ready(const MotorPins *pins) {
  return pins->pwm_timer != 0u &&
    pins->pwm_channel >= 1u &&
    pins->pwm_channel <= 4u &&
    pins->pwm_port != 0u &&
    pins->in1_port != 0u &&
    pins->in2_port != 0u;
}

static void configure_motor_io_for_index(uint32_t index) {
  MotorPins *pins;
  if (index >= MOTOR_COUNT) {
    return;
  }
  pins = &motor_pins[index];
  if (!motor_pins_ready(pins)) {
    motors[index].configured = 0;
    return;
  }
  gpio_alt(pins->pwm_port, pins->pwm_pin, 2, 0);
  gpio_output(pins->in1_port, pins->in1_pin);
  gpio_output(pins->in2_port, pins->in2_pin);
  if (pins->has_enable && pins->enable_port != 0u) {
    gpio_output(pins->enable_port, pins->enable_pin);
    gpio_high(pins->enable_port, pins->enable_pin);
  }
  if (pins->has_encoder && pins->encoder_a_port != 0u && pins->encoder_b_port != 0u) {
    gpio_input_pullup(pins->encoder_a_port, pins->encoder_a_pin);
    gpio_input_pullup(pins->encoder_b_port, pins->encoder_b_pin);
  }
  motors[index].configured = 1;
}

static void motor_enable(uint32_t index) {
  const MotorPins *pins;
  if (index >= MOTOR_COUNT) {
    return;
  }
  pins = &motor_pins[index];
  if (pins->has_enable && pins->enable_port != 0u) {
    gpio_high(pins->enable_port, pins->enable_pin);
  }
}

static void motor_pwm(uint32_t index, uint32_t duty_counts) {
  const MotorPins *pins;
  if (index >= MOTOR_COUNT) {
    return;
  }
  pins = &motor_pins[index];
  if (pins->pwm_timer == 0u) {
    return;
  }
  if (duty_counts > PWM_PERIOD_COUNTS) {
    duty_counts = PWM_PERIOD_COUNTS;
  }
  switch (pins->pwm_channel) {
    case 1u:
      TIM_CCR1(pins->pwm_timer) = duty_counts;
      break;
    case 2u:
      TIM_CCR2(pins->pwm_timer) = duty_counts;
      break;
    case 3u:
      TIM_CCR3(pins->pwm_timer) = duty_counts;
      break;
    case 4u:
      TIM_CCR4(pins->pwm_timer) = duty_counts;
      break;
    default:
      break;
  }
}

static void motor_pwm_percent(uint32_t index, uint32_t percent) {
  if (percent > 100u) {
    percent = 100u;
  }
  motors[index].duty_percent = percent;
  motors[index].control_duty_percent = percent;
  motor_pwm(index, (percent * PWM_PERIOD_COUNTS + 50u) / 100u);
}

static void update_motor_leds(void) {
  uint32_t forward = 0;
  uint32_t reverse = 0;
  for (uint32_t index = 0; index < MOTOR_COUNT; index++) {
    if (motors[index].commanded_speed_percent > 0) {
      forward = 1;
    } else if (motors[index].commanded_speed_percent < 0) {
      reverse = 1;
    }
  }
  led_green(forward);
  led_red(reverse);
}

static void apply_motor_stop(uint32_t index, const char *mode) {
  MotorRuntime *state;
  const MotorPins *pins;
  if (index >= MOTOR_COUNT) {
    return;
  }
  state = &motors[index];
  pins = &motor_pins[index];
  state->duty_percent = 0;
  state->control_duty_percent = 0;
  state->commanded_speed_percent = 0;
  state->target_rpm = 0;
  state->control_error_rpm = 0;
  state->control_integral_rpm = 0;
  state->closed_loop_last_ms = 0;
  state->direction = "stopped";
  state->stop_mode = str_eq(mode, "brake") ? "brake" : "coast";
  motor_pwm(index, 0);
  if (!state->configured || !motor_pins_ready(pins)) {
    update_motor_leds();
    return;
  }
  motor_enable(index);
  if (str_eq(state->stop_mode, "brake")) {
    gpio_high(pins->in1_port, pins->in1_pin);
    gpio_high(pins->in2_port, pins->in2_pin);
  } else {
    gpio_low(pins->in1_port, pins->in1_pin);
    gpio_low(pins->in2_port, pins->in2_pin);
  }
  update_motor_leds();
}

static void apply_motor_speed(uint32_t index, int32_t speed, const char *mode) {
  MotorRuntime *state;
  const MotorPins *pins;
  if (index >= MOTOR_COUNT) {
    return;
  }
  state = &motors[index];
  pins = &motor_pins[index];
  if (!state->configured || !motor_pins_ready(pins)) {
    return;
  }
  if (speed > 100) {
    speed = 100;
  }
  if (speed < -100) {
    speed = -100;
  }
  if (speed == 0) {
    apply_motor_stop(index, mode);
    return;
  }

  state->commanded_speed_percent = speed;
  state->stop_mode = str_eq(mode, "brake") ? "brake" : "coast";
  state->target_rpm = (int32_t)(((uint32_t)(speed < 0 ? -speed : speed) * state->closed_loop_max_rpm + 50u) / 100u);
  state->control_error_rpm = 0;
  state->control_integral_rpm = 0;
  state->closed_loop_last_ms = 0;
  motor_enable(index);
  if (speed > 0) {
    state->direction = "forward";
    gpio_high(pins->in1_port, pins->in1_pin);
    gpio_low(pins->in2_port, pins->in2_pin);
  } else {
    state->direction = "reverse";
    gpio_low(pins->in1_port, pins->in1_pin);
    gpio_high(pins->in2_port, pins->in2_pin);
  }
  motor_pwm_percent(index, (uint32_t)(speed < 0 ? -speed : speed));
  update_motor_leds();
}

static uint32_t encoder_level(uint32_t index, uint32_t encoder_b) {
  const MotorPins *pins;
  uintptr_t port;
  uint32_t pin;
  if (index >= MOTOR_COUNT) {
    return 0;
  }
  pins = &motor_pins[index];
  port = encoder_b ? pins->encoder_b_port : pins->encoder_a_port;
  pin = encoder_b ? pins->encoder_b_pin : pins->encoder_a_pin;
  if (!pins->has_encoder || port == 0u) {
    return 0;
  }
  return (GPIO_IDR(port) >> pin) & 1u;
}

static uint32_t encoder_state(uint32_t index) {
  return (encoder_level(index, 0) << 1) | encoder_level(index, 1);
}

static void poll_motor_encoder(uint32_t index) {
  static const int8_t transitions[16] = {
    0, 1, -1, 0,
    -1, 0, 0, 1,
    1, 0, 0, -1,
    0, -1, 1, 0
  };
  MotorRuntime *state = &motors[index];
  if (!motor_pins[index].has_encoder) {
    return;
  }
  const uint32_t next = encoder_state(index);
  const uint32_t previous = state->encoder_last_state & 3u;
  if (next != previous) {
    state->encoder_ticks += transitions[(previous << 2) | next];
    state->encoder_last_state = next;
  }
}

static void poll_next_motor_encoder(void) {
  static uint32_t next_index = 0;
  for (uint32_t scanned = 0; scanned < MOTOR_COUNT; scanned++) {
    const uint32_t index = next_index;
    next_index = (next_index + 1u) % MOTOR_COUNT;
    if (motor_pins[index].has_encoder) {
      poll_motor_encoder(index);
      return;
    }
  }
}

static int32_t encoder_ticks(uint32_t index) {
  poll_motor_encoder(index);
  return motors[index].encoder_ticks;
}

static void reset_motor_encoder(uint32_t index) {
  motors[index].encoder_ticks = 0;
  motors[index].encoder_last_state = encoder_state(index);
  motors[index].encoder_sample_valid = 0;
  motors[index].last_encoder_ticks = 0;
  motors[index].last_encoder_ms = millis();
  motors[index].pulse_hz = 0;
  motors[index].encoder_delta = 0;
  motors[index].encoder_direction = "stopped";
  motors[index].speed_rpm = 0;
}

static void update_encoder_metrics(uint32_t index) {
  MotorRuntime *state = &motors[index];
  const uint32_t now = millis();
  const int32_t ticks = encoder_ticks(index);
  uint32_t abs_delta;
  if (!motor_pins[index].has_encoder) {
    state->encoder_sample_valid = 0;
    state->encoder_delta = 0;
    state->encoder_direction = "stopped";
    state->pulse_hz = 0;
    state->speed_rpm = 0;
    return;
  }
  if (!state->encoder_sample_valid) {
    state->encoder_sample_valid = 1;
    state->last_encoder_ticks = ticks;
    state->last_encoder_ms = now;
    state->encoder_delta = 0;
    state->encoder_direction = "stopped";
    state->pulse_hz = 0;
    state->speed_rpm = 0;
    return;
  }
  const uint32_t elapsed = now - state->last_encoder_ms;
  if (elapsed < ENCODER_MIN_SAMPLE_MS) {
    return;
  }
  state->encoder_delta = ticks - state->last_encoder_ticks;
  state->encoder_direction = state->encoder_delta > 0 ? "forward" : state->encoder_delta < 0 ? "reverse" : "stopped";
  abs_delta = state->encoder_delta < 0 ? (uint32_t)(-state->encoder_delta) : (uint32_t)state->encoder_delta;
  state->pulse_hz = (uint32_t)(((uint64_t)abs_delta * 1000u) / elapsed);
  state->speed_rpm = (uint32_t)(((uint64_t)abs_delta * 60000u) / ((uint64_t)elapsed * state->encoder_ticks_per_rev));
  state->last_encoder_ticks = ticks;
  state->last_encoder_ms = now;
}

static void update_closed_loop_control(void) {
  const uint32_t now = millis();
  for (uint32_t index = 0; index < MOTOR_COUNT; index++) {
    MotorRuntime *state = &motors[index];
    int32_t error;
    int32_t correction;
    int32_t output;
    int32_t base_duty;

    if (!state->configured || !motor_pins[index].has_encoder || !state->closed_loop_enabled || state->commanded_speed_percent == 0 || state->target_rpm <= 0) {
      continue;
    }
    if (state->closed_loop_last_ms == 0u) {
      state->closed_loop_last_ms = now;
      continue;
    }
    if ((uint32_t)(now - state->closed_loop_last_ms) < CLOSED_LOOP_UPDATE_MS) {
      continue;
    }
    state->closed_loop_last_ms = now;

    update_encoder_metrics(index);
    error = state->target_rpm - (int32_t)state->speed_rpm;
    if (error > -CLOSED_LOOP_RPM_DEADBAND && error < CLOSED_LOOP_RPM_DEADBAND) {
      error = 0;
    }
    state->control_error_rpm = error;
    state->control_integral_rpm = clamp_i32(state->control_integral_rpm + error, -CLOSED_LOOP_INTEGRAL_LIMIT_RPM, CLOSED_LOOP_INTEGRAL_LIMIT_RPM);

    base_duty = state->commanded_speed_percent < 0 ? -state->commanded_speed_percent : state->commanded_speed_percent;
    correction = (error / CLOSED_LOOP_KP_DIV) + (state->control_integral_rpm / CLOSED_LOOP_KI_DIV);
    output = clamp_i32(base_duty + correction, 0, 100);
    motor_pwm_percent(index, (uint32_t)output);
  }
}

static uint32_t wait_can_init_state(uint32_t in_init, uint32_t timeout_ms) {
  const uint32_t start = millis();
  while (((CAN_MSR(CAN1_BASE) & 1u) != 0u) != (in_init != 0u)) {
    if ((uint32_t)(millis() - start) > timeout_ms) {
      return 0;
    }
  }
  return 1;
}

static uint32_t can_rx_pending(void) {
  return CAN_RF0R(CAN1_BASE) & 3u;
}

static uint32_t select_can_tx_mailbox(void) {
  const uint32_t tsr = CAN_TSR(CAN1_BASE);
  if (tsr & (1u << 26)) {
    return 0;
  }
  if (tsr & (1u << 27)) {
    return 1;
  }
  if (tsr & (1u << 28)) {
    return 2;
  }
  return 3;
}

static uint32_t can_send_frame(uint32_t id, uint32_t extended, const uint8_t *data, uint32_t dlc, uint32_t timeout_ms) {
  const uint32_t mailbox = select_can_tx_mailbox();
  uint32_t low = 0;
  uint32_t high = 0;
  uint32_t start;
  uint32_t status;
  uint32_t rqcp;
  uint32_t txok;
  uint32_t abrq;

  if (!can_ready || dlc > CAN_MAX_DLC || mailbox > 2u) {
    can_tx_error++;
    return 0;
  }
  if ((!extended && id > CAN_STD_ID_MAX) || (extended && id > CAN_EXT_ID_MAX)) {
    can_tx_error++;
    return 0;
  }

  for (uint32_t i = 0; i < dlc && i < 4u; ++i) {
    low |= ((uint32_t)data[i]) << (i * 8u);
  }
  for (uint32_t i = 4; i < dlc && i < 8u; ++i) {
    high |= ((uint32_t)data[i]) << ((i - 4u) * 8u);
  }

  CAN_TIR(CAN1_BASE, mailbox) = extended ? ((id & CAN_EXT_ID_MAX) << 3) | (1u << 2) : ((id & CAN_STD_ID_MAX) << 21);
  CAN_TDTR(CAN1_BASE, mailbox) = dlc & 0xFu;
  CAN_TDLR(CAN1_BASE, mailbox) = low;
  CAN_TDHR(CAN1_BASE, mailbox) = high;
  CAN_TIR(CAN1_BASE, mailbox) |= 1u;

  rqcp = 1u << (mailbox * 8u);
  txok = 1u << ((mailbox * 8u) + 1u);
  abrq = 1u << ((mailbox * 8u) + 7u);
  start = millis();

  while ((CAN_TSR(CAN1_BASE) & rqcp) == 0u) {
    if ((uint32_t)(millis() - start) > timeout_ms) {
      CAN_TSR(CAN1_BASE) = abrq;
      can_tx_timeout++;
      return 0;
    }
  }

  status = CAN_TSR(CAN1_BASE);
  CAN_TSR(CAN1_BASE) = rqcp;
  if (status & txok) {
    can_tx_ok++;
    return 1;
  }

  can_tx_error++;
  return 0;
}

static uint32_t can_send_standard(uint32_t id, const uint8_t *data, uint32_t dlc, uint32_t timeout_ms) {
  return can_send_frame(id, 0, data, dlc, timeout_ms);
}

static uint32_t can_btr_for_bitrate(uint32_t bitrate_kbps, uint32_t *out_btr) {
  const uint32_t bitrate = bitrate_kbps * 1000u;
  if (bitrate == 0u) {
    return 0;
  }
  for (uint32_t prescaler = 1; prescaler <= 1024u; ++prescaler) {
    const uint32_t denom = prescaler * bitrate;
    uint32_t total_tq;
    uint32_t bs2;
    uint32_t bs1;
    if (denom == 0u || (system_core_hz % denom) != 0u) {
      continue;
    }
    total_tq = system_core_hz / denom;
    if (total_tq < 8u || total_tq > 25u) {
      continue;
    }
    bs2 = total_tq / 5u;
    if (bs2 < 2u) {
      bs2 = 2u;
    }
    if (bs2 > 8u) {
      bs2 = 8u;
    }
    bs1 = total_tq - 1u - bs2;
    if (bs1 < 1u || bs1 > 16u) {
      continue;
    }
    *out_btr = ((prescaler - 1u) & 0x3FFu) | (((bs1 - 1u) & 0xFu) << 16) | (((bs2 - 1u) & 0x7u) << 20);
    return 1;
  }
  return 0;
}

static void build_robomaster_current_frame(uint32_t slot, int32_t current, uint8_t *data) {
  const int32_t clamped = clamp_i32(current, -20000, 20000);
  const uint16_t encoded = (uint16_t)(int16_t)clamped;
  for (uint32_t i = 0; i < CAN_MAX_DLC; ++i) {
    data[i] = 0;
  }
  if (slot < 1u || slot > 4u) {
    return;
  }
  data[(slot - 1u) * 2u] = (uint8_t)((encoded >> 8) & 0xFFu);
  data[((slot - 1u) * 2u) + 1u] = (uint8_t)(encoded & 0xFFu);
}

static uint32_t init_can1_pd0_pd1(uint32_t bitrate_kbps) {
  uint32_t btr = 0;
  if (!can_btr_for_bitrate(bitrate_kbps, &btr)) {
    return 0;
  }

  can_ready = 0;
  can_bitrate_kbps = bitrate_kbps;
  can_tx_ok = 0;
  can_tx_error = 0;
  can_tx_timeout = 0;

  RCC_APB1RSTR |= (1u << 25);
  (void)RCC_APB1RSTR;
  RCC_APB1RSTR &= ~(1u << 25);
  (void)RCC_APB1RSTR;

  RCC_APB1ENR |= (1u << 25);
  (void)RCC_APB1ENR;
  gpio_alt(GPIOD_BASE, 0, 9, 0);
  gpio_alt(GPIOD_BASE, 1, 9, 0);

  CAN_MCR(CAN1_BASE) = 1u | (1u << 6);
  if (!wait_can_init_state(1, 100)) {
    return 0;
  }

  CAN_BTR(CAN1_BASE) = btr;

  CAN_FMR(CAN1_BASE) |= 1u;
  CAN_FA1R(CAN1_BASE) &= ~1u;
  CAN_FM1R(CAN1_BASE) &= ~1u;
  CAN_FS1R(CAN1_BASE) |= 1u;
  CAN_FFA1R(CAN1_BASE) &= ~1u;
  CAN_FR1(CAN1_BASE, 0) = 0;
  CAN_FR2(CAN1_BASE, 0) = 0;
  CAN_FA1R(CAN1_BASE) |= 1u;
  CAN_FMR(CAN1_BASE) &= ~1u;

  CAN_MCR(CAN1_BASE) &= ~1u;
  can_ready = wait_can_init_state(0, 100);
  return can_ready;
}

static void send_ack(int32_t seq, const char *command) {
  uart_write_str("{\"type\":\"ack\",\"seq\":");
  uart_write_i32(seq);
  uart_write_str(",\"command\":\"");
  uart_write_str(command);
  uart_write_str("\"}\n");
}

static void send_error(int32_t seq, const char *command, const char *code, const char *message) {
  uart_write_str("{\"type\":\"error\",\"seq\":");
  uart_write_i32(seq);
  uart_write_str(",\"command\":\"");
  uart_write_str(command);
  uart_write_str("\",\"code\":\"");
  uart_write_str(code);
  uart_write_str("\",\"message\":\"");
  uart_write_str(message);
  uart_write_str("\"}\n");
}

static void send_protocol_feedback(int32_t seq) {
  uart_write_str("{\"type\":\"protocol.feedback\",\"seq\":");
  uart_write_i32(seq);
  uart_write_str(",\"protocolVersion\":");
  uart_write_u32(BINARY_PROTOCOL_VERSION);
  uart_write_str(",\"binaryProtocolReady\":true");
  uart_write_str(",\"framesIn\":");
  uart_write_u32(binary_frames_in);
  uart_write_str(",\"framesOut\":0");
  uart_write_str(",\"crcError\":");
  uart_write_u32(binary_crc_error);
  uart_write_str(",\"cobsError\":");
  uart_write_u32(binary_cobs_error);
  uart_write_str(",\"dropCount\":");
  uart_write_u32(dropped_motion_count + binary_drop_count);
  uart_write_str(",\"lastFrameMs\":");
  uart_write_u32(millis());
  uart_write_str("}\n");
}

static void send_feedback(int32_t seq, uint32_t index) {
  MotorRuntime *state;
  if (index >= MOTOR_COUNT) {
    return;
  }
  state = &motors[index];
  update_encoder_metrics(index);
  uart_write_str("{\"type\":\"motor.feedback\",\"seq\":");
  uart_write_i32(seq);
  uart_write_str(",\"channel\":\"");
  uart_write_str(motor_pins[index].channel);
  uart_write_str("\",\"commandedSpeedPercent\":");
  uart_write_i32(state->commanded_speed_percent);
  uart_write_str(",\"dutyPercent\":");
  uart_write_u32(state->duty_percent);
  uart_write_str(",\"direction\":\"");
  uart_write_str(state->direction);
  uart_write_str("\",\"stopMode\":\"");
  uart_write_str(state->stop_mode);
  uart_write_str("\",\"closedLoop\":");
  uart_write_str(state->closed_loop_enabled ? "true" : "false");
  uart_write_str(",\"targetRpm\":");
  uart_write_i32(state->target_rpm);
  uart_write_str(",\"controlDutyPercent\":");
  uart_write_u32(state->control_duty_percent);
  uart_write_str(",\"controlErrorRpm\":");
  uart_write_i32(state->control_error_rpm);
  uart_write_str(",\"speedRpm\":");
  uart_write_u32(state->speed_rpm);
  uart_write_str(",\"encoderTicks\":");
  uart_write_i32(encoder_ticks(index));
  uart_write_str(",\"pulseHz\":");
  uart_write_u32(state->pulse_hz);
  uart_write_str(",\"encoderA\":");
  uart_write_u32(encoder_level(index, 0));
  uart_write_str(",\"encoderB\":");
  uart_write_u32(encoder_level(index, 1));
  uart_write_str(",\"encoderDelta\":");
  uart_write_i32(state->encoder_delta);
  uart_write_str(",\"encoderDirection\":\"");
  uart_write_str(state->encoder_direction);
  uart_write_str("\",\"sampleMs\":");
  uart_write_u32(millis());
  uart_write_str("}\n");
}

static void send_can_feedback(int32_t seq, const char *command, uint32_t ok) {
  uart_write_str("{\"type\":\"can.feedback\",\"seq\":");
  uart_write_i32(seq);
  uart_write_str(",\"command\":\"");
  uart_write_str(command);
  uart_write_str("\",\"ok\":");
  uart_write_str(ok ? "true" : "false");
  uart_write_str(",\"ready\":");
  uart_write_str(can_ready ? "true" : "false");
  uart_write_str(",\"bitrateKbps\":");
  uart_write_u32(can_bitrate_kbps);
  uart_write_str(",\"clockHz\":");
  uart_write_u32(system_core_hz);
  uart_write_str(",\"txOk\":");
  uart_write_u32(can_tx_ok);
  uart_write_str(",\"txError\":");
  uart_write_u32(can_tx_error);
  uart_write_str(",\"txTimeout\":");
  uart_write_u32(can_tx_timeout);
  uart_write_str(",\"rxPending\":");
  uart_write_u32(can_rx_pending());
  uart_write_str(",\"esr\":");
  uart_write_u32(CAN_ESR(CAN1_BASE));
  uart_write_str("}\n");
}

static void send_scheduler_feedback_with_priority(int32_t seq, const char *command, uint32_t accepted, const char *message, int32_t priority) {
  uart_write_str("{\"type\":\"scheduler.feedback\",\"seq\":");
  uart_write_i32(seq);
  uart_write_str(",\"command\":\"");
  uart_write_str(command);
  uart_write_str("\",\"accepted\":");
  uart_write_str(accepted ? "true" : "false");
  uart_write_str(",\"motionPending\":");
  uart_write_str(motion_pending ? "true" : "false");
  uart_write_str(",\"latestMotionSeq\":");
  uart_write_i32(latest_motion_seq);
  uart_write_str(",\"droppedMotionCount\":");
  uart_write_u32(dropped_motion_count);
  uart_write_str(",\"activeCommand\":\"");
  uart_write_str(active_command);
  uart_write_str("\"");
  if (priority >= 0) {
    uart_write_str(",\"priority\":");
    uart_write_i32(priority);
  }
  if (message) {
    uart_write_str(",\"message\":\"");
    uart_write_str(message);
    uart_write_str("\"");
  }
  uart_write_str("}\n");
}

static void send_scheduler_feedback(int32_t seq, const char *command, uint32_t accepted, const char *message) {
  send_scheduler_feedback_with_priority(seq, command, accepted, message, -1);
}

static void send_mecanum_feedback(
  int32_t seq,
  int32_t forward_milli,
  int32_t strafe_milli,
  int32_t turn_milli,
  int32_t speed_limit_percent,
  const char *stop_mode,
  int32_t front_left,
  int32_t front_right,
  int32_t rear_left,
  int32_t rear_right
) {
  uart_write_str("{\"type\":\"mecanum.feedback\",\"seq\":");
  uart_write_i32(seq);
  uart_write_str(",\"forward\":");
  uart_write_i32(forward_milli);
  uart_write_str(",\"strafe\":");
  uart_write_i32(strafe_milli);
  uart_write_str(",\"turn\":");
  uart_write_i32(turn_milli);
  uart_write_str(",\"speedLimitPercent\":");
  uart_write_i32(speed_limit_percent);
  uart_write_str(",\"stopMode\":\"");
  uart_write_str(stop_mode);
  uart_write_str("\",\"frontLeft\":");
  uart_write_i32(front_left);
  uart_write_str(",\"frontRight\":");
  uart_write_i32(front_right);
  uart_write_str(",\"rearLeft\":");
  uart_write_i32(rear_left);
  uart_write_str(",\"rearRight\":");
  uart_write_i32(rear_right);
  uart_write_str(",\"droppedMotionCount\":");
  uart_write_u32(dropped_motion_count);
  uart_write_str(",\"sampleMs\":");
  uart_write_u32(millis());
  uart_write_str("}\n");
}

static uint32_t asmg_baud_code_to_kbps(uint32_t code) {
  if (code == ASMG_MD_BAUD_500_CODE) {
    return 500u;
  }
  if (code == ASMG_MD_BAUD_1000_CODE) {
    return 1000u;
  }
  return 250u;
}

static uint32_t asmg_baud_kbps_to_code(int32_t baud_kbps) {
  if (baud_kbps == 500) {
    return ASMG_MD_BAUD_500_CODE;
  }
  if (baud_kbps == 1000) {
    return ASMG_MD_BAUD_1000_CODE;
  }
  return ASMG_MD_BAUD_250_CODE;
}

static uint32_t asmg_u16(const uint8_t *data, uint32_t index) {
  return (((uint32_t)data[index]) << 8) | (uint32_t)data[index + 1u];
}

static void send_can_servo_feedback(int32_t seq, const char *command, uint32_t ok, const uint8_t *data, uint32_t dlc) {
  const uint32_t asmg_command = dlc >= 2u ? data[1] : 0u;
  uart_write_str("{\"type\":\"can_servo.feedback\",\"seq\":");
  uart_write_i32(seq);
  uart_write_str(",\"command\":\"");
  uart_write_str(command);
  uart_write_str("\",\"ok\":");
  uart_write_str(ok ? "true" : "false");
  uart_write_str(",\"ready\":");
  uart_write_str(can_ready ? "true" : "false");
  if (dlc >= 1u) {
    uart_write_str(",\"servoId\":");
    uart_write_u32(data[0]);
  }
  if (dlc >= 2u) {
    uart_write_str(",\"asmgCommand\":");
    uart_write_u32(asmg_command);
  }
  uart_write_str(",\"rawDataHex\":\"");
  for (uint32_t i = 0; i < dlc; ++i) {
    if (i > 0u) {
      uart_write_char(' ');
    }
    uart_write_hex_byte(data[i]);
  }
  uart_write_str("\"");
  if (asmg_command == 0x01u && dlc >= 6u) {
    uart_write_str(",\"position\":");
    uart_write_u32(asmg_u16(data, 2));
    uart_write_str(",\"speed\":");
    uart_write_u32(asmg_u16(data, 4));
  } else if (asmg_command == 0x02u && dlc >= 6u) {
    uart_write_str(",\"currentPosition\":");
    uart_write_u32(asmg_u16(data, 2));
    uart_write_str(",\"commandPosition\":");
    uart_write_u32(asmg_u16(data, 4));
  } else if (asmg_command == 0x03u && dlc >= 6u) {
    uart_write_str(",\"currentTorque\":");
    uart_write_u32(asmg_u16(data, 2));
    uart_write_str(",\"setCurrent\":");
    uart_write_u32(asmg_u16(data, 4));
  } else if (asmg_command == 0x05u && dlc >= 8u) {
    uart_write_str(",\"p\":");
    uart_write_u32(asmg_u16(data, 2));
    uart_write_str(",\"i\":");
    uart_write_u32(asmg_u16(data, 4));
    uart_write_str(",\"d\":");
    uart_write_u32(asmg_u16(data, 6));
  } else if (asmg_command == 0x06u && dlc >= 8u) {
    uart_write_str(",\"p\":");
    uart_write_u32(asmg_u16(data, 2));
    uart_write_str(",\"i\":");
    uart_write_u32(asmg_u16(data, 4));
    uart_write_str(",\"d\":");
    uart_write_u32(asmg_u16(data, 6));
  } else if (asmg_command == 0x07u && dlc >= 6u) {
    uart_write_str(",\"currentPosition\":");
    uart_write_u32(asmg_u16(data, 2));
    uart_write_str(",\"current\":");
    uart_write_u32(asmg_u16(data, 4));
  } else if (asmg_command == 0x08u && dlc >= 4u) {
    uart_write_str(",\"centerRatio\":");
    uart_write_u32(asmg_u16(data, 2));
  } else if (asmg_command == 0x09u && dlc >= 3u) {
    uart_write_str(",\"baudKbps\":");
    uart_write_u32(asmg_baud_code_to_kbps(data[2]));
  } else if (asmg_command == 0xFEu && dlc >= 1u) {
    uart_write_str(",\"newId\":");
    uart_write_u32(data[0]);
  }
  uart_write_str(",\"txOk\":");
  uart_write_u32(can_tx_ok);
  uart_write_str(",\"txError\":");
  uart_write_u32(can_tx_error);
  uart_write_str(",\"txTimeout\":");
  uart_write_u32(can_tx_timeout);
  uart_write_str(",\"rxPending\":");
  uart_write_u32(can_rx_pending());
  uart_write_str(",\"esr\":");
  uart_write_u32(CAN_ESR(CAN1_BASE));
  uart_write_str("}\n");
}

static void send_imu_feedback(int32_t seq) {
  ImuSample sample;
  const char *error = 0;
  const uint32_t ok = read_imu_sample(&sample, &error);

  uart_write_str("{\"type\":\"imu.feedback\",\"seq\":");
  uart_write_i32(seq);
  uart_write_str(",\"ready\":");
  uart_write_str(ok ? "true" : "false");
  uart_write_str(",\"mpuWhoAmI\":");
  uart_write_u32(sample.mpu_whoami);
  uart_write_str(",\"istWhoAmI\":");
  uart_write_u32(sample.ist_whoami);
  uart_write_str(",\"accelRaw\":{\"x\":");
  uart_write_i32(sample.accel_x);
  uart_write_str(",\"y\":");
  uart_write_i32(sample.accel_y);
  uart_write_str(",\"z\":");
  uart_write_i32(sample.accel_z);
  uart_write_str("},\"gyroRaw\":{\"x\":");
  uart_write_i32(sample.gyro_x);
  uart_write_str(",\"y\":");
  uart_write_i32(sample.gyro_y);
  uart_write_str(",\"z\":");
  uart_write_i32(sample.gyro_z);
  uart_write_str("},\"magRaw\":{\"x\":");
  uart_write_i32(sample.mag_x);
  uart_write_str(",\"y\":");
  uart_write_i32(sample.mag_y);
  uart_write_str(",\"z\":");
  uart_write_i32(sample.mag_z);
  uart_write_str("},\"tempRaw\":");
  uart_write_i32(sample.temp);
  uart_write_str(",\"sampleMs\":");
  uart_write_u32(sample.sample_ms);
  if (error) {
    uart_write_str(",\"error\":\"");
    uart_write_str(error);
    uart_write_str("\"");
  }
  uart_write_str("}\n");
}

static void send_can_frame(int32_t seq) {
  const uint32_t rir = CAN_RIR(CAN1_BASE);
  const uint32_t rdtr = CAN_RDTR(CAN1_BASE);
  const uint32_t low = CAN_RDLR(CAN1_BASE);
  const uint32_t high = CAN_RDHR(CAN1_BASE);
  const uint32_t extended = (rir & (1u << 2)) != 0u;
  const uint32_t id = extended ? ((rir >> 3) & 0x1FFFFFFFu) : ((rir >> 21) & CAN_STD_ID_MAX);
  uint32_t dlc = rdtr & 0xFu;
  if (dlc > CAN_MAX_DLC) {
    dlc = CAN_MAX_DLC;
  }

  uart_write_str("{\"type\":\"can.frame\",\"seq\":");
  uart_write_i32(seq);
  uart_write_str(",\"id\":");
  uart_write_u32(id);
  uart_write_str(",\"extended\":");
  uart_write_str(extended ? "true" : "false");
  uart_write_str(",\"rtr\":");
  uart_write_str((rir & (1u << 1)) ? "true" : "false");
  uart_write_str(",\"dlc\":");
  uart_write_u32(dlc);
  uart_write_str(",\"dataHex\":\"");
  for (uint32_t i = 0; i < dlc; ++i) {
    uint32_t byte = i < 4u ? ((low >> (i * 8u)) & 0xFFu) : ((high >> ((i - 4u) * 8u)) & 0xFFu);
    if (i > 0u) {
      uart_write_char(' ');
    }
    uart_write_hex_byte(byte);
  }
  uart_write_str("\"}\n");
  CAN_RF0R(CAN1_BASE) = (1u << 5);
}

static uint32_t drain_can_rx(int32_t seq, uint32_t max_frames) {
  uint32_t count = 0;
  while (can_rx_pending() && count < max_frames) {
    send_can_frame(seq);
    count++;
  }
  return count;
}

static void read_can_servo_frame(int32_t seq, const char *command) {
  const uint32_t rir = CAN_RIR(CAN1_BASE);
  const uint32_t rdtr = CAN_RDTR(CAN1_BASE);
  const uint32_t low = CAN_RDLR(CAN1_BASE);
  const uint32_t high = CAN_RDHR(CAN1_BASE);
  uint32_t dlc = rdtr & 0xFu;
  uint8_t data[CAN_MAX_DLC] = { 0 };
  if (dlc > CAN_MAX_DLC) {
    dlc = CAN_MAX_DLC;
  }
  (void)rir;
  for (uint32_t i = 0; i < dlc; ++i) {
    data[i] = (uint8_t)(i < 4u ? ((low >> (i * 8u)) & 0xFFu) : ((high >> ((i - 4u) * 8u)) & 0xFFu));
  }
  send_can_servo_feedback(seq, command, 1, data, dlc);
  CAN_RF0R(CAN1_BASE) = (1u << 5);
}

static uint32_t drain_can_servo_rx(int32_t seq, const char *command, uint32_t max_frames) {
  uint32_t count = 0;
  while (can_rx_pending() && count < max_frames) {
    read_can_servo_frame(seq, command);
    count++;
  }
  return count;
}

static uint32_t can_send_asmg(int32_t seq, const char *command, const uint8_t *data, uint32_t read_after) {
  uint8_t local[CAN_MAX_DLC] = { 0 };
  uint32_t ok;
  for (uint32_t i = 0; i < CAN_MAX_DLC; ++i) {
    local[i] = data[i];
  }
  ok = can_send_frame(ASMG_MD_HOST_EXTENDED_ID, 1, local, CAN_MAX_DLC, CAN_TX_TIMEOUT_MS);
  if (!ok) {
    send_can_servo_feedback(seq, command, 0, local, CAN_MAX_DLC);
    return 0;
  }
  if (read_after) {
    delay_ms(2);
    if (drain_can_servo_rx(seq, command, CAN_STATUS_RX_DRAIN_MAX) == 0u) {
      send_can_servo_feedback(seq, command, 1, local, CAN_MAX_DLC);
    }
  } else {
    send_can_servo_feedback(seq, command, 1, local, CAN_MAX_DLC);
  }
  return 1;
}

static void build_asmg_move(uint8_t *data, int32_t id, int32_t position, int32_t speed) {
  const uint32_t pos = (uint32_t)clamp_i32(position, ASMG_MD_POSITION_MIN, ASMG_MD_POSITION_MAX);
  const uint32_t spd = (uint32_t)clamp_i32(speed, ASMG_MD_SPEED_MIN, ASMG_MD_SPEED_MAX);
  data[0] = (uint8_t)clamp_i32(id, 0, 253);
  data[1] = 0x01u;
  data[2] = (uint8_t)((pos >> 8) & 0xFFu);
  data[3] = (uint8_t)(pos & 0xFFu);
  data[4] = (uint8_t)((spd >> 8) & 0xFFu);
  data[5] = (uint8_t)(spd & 0xFFu);
}

static void build_asmg_read(uint8_t *data, int32_t id, uint32_t command) {
  data[0] = (uint8_t)clamp_i32(id, 0, 254);
  data[1] = (uint8_t)(command & 0xFFu);
}

static void build_asmg_u16_command(uint8_t *data, int32_t id, uint32_t command, int32_t value) {
  const uint32_t word = (uint32_t)clamp_i32(value, 0, 0xFFFF);
  data[0] = (uint8_t)clamp_i32(id, 0, 253);
  data[1] = (uint8_t)(command & 0xFFu);
  data[2] = (uint8_t)((word >> 8) & 0xFFu);
  data[3] = (uint8_t)(word & 0xFFu);
}

static void build_asmg_pid(uint8_t *data, int32_t id, int32_t p, int32_t i, int32_t d) {
  const uint32_t kp = (uint32_t)clamp_i32(p, 0, 0xFFFF);
  const uint32_t ki = (uint32_t)clamp_i32(i, 0, 0xFFFF);
  const uint32_t kd = (uint32_t)clamp_i32(d, 0, 0xFFFF);
  data[0] = (uint8_t)clamp_i32(id, 0, 253);
  data[1] = 0x05u;
  data[2] = (uint8_t)((kp >> 8) & 0xFFu);
  data[3] = (uint8_t)(kp & 0xFFu);
  data[4] = (uint8_t)((ki >> 8) & 0xFFu);
  data[5] = (uint8_t)(ki & 0xFFu);
  data[6] = (uint8_t)((kd >> 8) & 0xFFu);
  data[7] = (uint8_t)(kd & 0xFFu);
}

static void copy_stop_mode(char *out, const char *mode) {
  if (str_eq(mode, "brake")) {
    out[0] = 'b';
    out[1] = 'r';
    out[2] = 'a';
    out[3] = 'k';
    out[4] = 'e';
    out[5] = 0;
    return;
  }
  out[0] = 'c';
  out[1] = 'o';
  out[2] = 'a';
  out[3] = 's';
  out[4] = 't';
  out[5] = 0;
}

static void indexed_json_key(char *out, const char *prefix, uint32_t index) {
  uint32_t pos = 0;
  while (*prefix && pos < 14u) {
    out[pos++] = *prefix++;
  }
  out[pos++] = (char)('0' + (index % 10u));
  out[pos] = 0;
}

static int32_t motion_priority_from_json(const char *line, int32_t fallback) {
  int32_t priority = fallback;
  (void)json_int_or(line, "priority", &priority, fallback);
  return clamp_i32(priority, 0, 1000);
}

static void clear_pending_motion(const char *reason) {
  if (motion_pending) {
    motion_pending = 0;
    dropped_motion_count++;
    send_scheduler_feedback(pending_motion.seq, "motion.clear", 0, reason);
  }
  pending_motion.kind = MOTION_NONE;
}

static void queue_motion(PendingMotion motion, const char *command) {
  if (motion_pending) {
    dropped_motion_count++;
  }
  pending_motion = motion;
  motion_pending = 1;
  latest_motion_seq = motion.seq;
  send_ack(motion.seq, command);
  send_scheduler_feedback_with_priority(motion.seq, command, 1, "queued latest motion target", motion.priority);
}

static void apply_motor_target_motion(const PendingMotion *motion) {
  MotorRuntime *state;
  if (motion->motor_index < 0 || motion->motor_index >= (int32_t)MOTOR_COUNT) {
    send_error(motion->seq, "motor.target", "unsupported_channel", MOTOR_SUPPORT_MESSAGE);
    return;
  }
  state = &motors[(uint32_t)motion->motor_index];
  if (!state->configured) {
    send_error(motion->seq, "motor.target", "unconfigured_channel", "send motor.config before motor commands");
    return;
  }
  if (motion->closed_loop_set) {
    state->closed_loop_enabled = motion->closed_loop && motor_pins[(uint32_t)motion->motor_index].has_encoder;
  }
  apply_motor_speed((uint32_t)motion->motor_index, motion->speed_percent, motion->stop_mode);
  if (state->commanded_speed_percent != 0 && motion->target_rpm > 0) {
    state->target_rpm = clamp_i32(motion->target_rpm, 1, (int32_t)CLOSED_LOOP_MAX_RPM_LIMIT);
  }
  send_feedback(motion->seq, (uint32_t)motion->motor_index);
}

static int32_t mecanum_speed_percent(int32_t raw, int32_t max_magnitude, int32_t speed_limit_percent, int32_t direction) {
  int32_t value = divide_round_i32(raw * clamp_i32(speed_limit_percent, 0, 100), max_magnitude);
  value *= direction;
  return clamp_i32(value, -100, 100);
}

static void apply_mecanum_target_motion(const PendingMotion *motion) {
  const int32_t fl_raw = motion->forward_milli + motion->strafe_milli + motion->turn_milli;
  const int32_t fr_raw = motion->forward_milli - motion->strafe_milli - motion->turn_milli;
  const int32_t rl_raw = motion->forward_milli - motion->strafe_milli + motion->turn_milli;
  const int32_t rr_raw = motion->forward_milli + motion->strafe_milli - motion->turn_milli;
  int32_t max_magnitude = 1000;
  int32_t fl;
  int32_t fr;
  int32_t rl;
  int32_t rr;
  if (abs_i32(fl_raw) > max_magnitude) max_magnitude = abs_i32(fl_raw);
  if (abs_i32(fr_raw) > max_magnitude) max_magnitude = abs_i32(fr_raw);
  if (abs_i32(rl_raw) > max_magnitude) max_magnitude = abs_i32(rl_raw);
  if (abs_i32(rr_raw) > max_magnitude) max_magnitude = abs_i32(rr_raw);
  fl = mecanum_speed_percent(fl_raw, max_magnitude, motion->speed_limit_percent, mecanum_direction[0]);
  fr = mecanum_speed_percent(fr_raw, max_magnitude, motion->speed_limit_percent, mecanum_direction[3]);
  rl = mecanum_speed_percent(rl_raw, max_magnitude, motion->speed_limit_percent, mecanum_direction[1]);
  rr = mecanum_speed_percent(rr_raw, max_magnitude, motion->speed_limit_percent, mecanum_direction[2]);
  for (uint32_t index = 0; index < MOTOR_COUNT; ++index) {
    motors[index].closed_loop_enabled = mecanum_closed_loop && motor_pins[index].has_encoder;
    motors[index].closed_loop_max_rpm = mecanum_max_rpm;
    motors[index].encoder_ticks_per_rev = mecanum_encoder_ticks_per_rev;
  }
  apply_motor_speed(mecanum_channel_map[0], fl, motion->stop_mode);
  apply_motor_speed(mecanum_channel_map[3], fr, motion->stop_mode);
  apply_motor_speed(mecanum_channel_map[1], rl, motion->stop_mode);
  apply_motor_speed(mecanum_channel_map[2], rr, motion->stop_mode);
  send_mecanum_feedback(motion->seq, motion->forward_milli, motion->strafe_milli, motion->turn_milli, motion->speed_limit_percent, motion->stop_mode, fl, fr, rl, rr);
}

static void apply_can_servo_move_motion(const PendingMotion *motion) {
  uint8_t data[CAN_MAX_DLC] = { 0 };
  build_asmg_move(data, motion->can_servo_id, motion->can_servo_position, motion->can_servo_speed);
  (void)can_send_asmg(motion->seq, "can_servo.move", data, 0);
}

static void apply_can_servo_group_move_motion(const PendingMotion *motion) {
  uint8_t data[CAN_MAX_DLC] = { 0 };
  uint32_t ok = 1;
  if (motion->can_servo_count == 0u || motion->can_servo_count > CAN_SERVO_GROUP_MAX_TARGETS) {
    send_error(motion->seq, "can_servo.group_move", "invalid_argument", "count must be 1-8");
    return;
  }
  for (uint32_t index = 0; index < motion->can_servo_count; index++) {
    build_asmg_move(data, motion->can_servo_targets[index].id, motion->can_servo_targets[index].position, motion->can_servo_speed);
    if (!can_send_frame(ASMG_MD_HOST_EXTENDED_ID, 1, data, CAN_MAX_DLC, CAN_TX_TIMEOUT_MS)) {
      ok = 0;
      break;
    }
  }
  send_can_servo_feedback(motion->seq, "can_servo.group_move", ok, data, CAN_MAX_DLC);
}

static void apply_pending_motion(void) {
  PendingMotion motion;
  if (!motion_pending) {
    return;
  }
  if ((uint32_t)(millis() - last_motion_apply_ms) < MOTION_APPLY_INTERVAL_MS) {
    return;
  }
  motion = pending_motion;
  motion_pending = 0;
  pending_motion.kind = MOTION_NONE;
  last_motion_apply_ms = millis();
  if (motion.kind == MOTION_MOTOR_TARGET) {
    active_command = "motor.target";
    apply_motor_target_motion(&motion);
  } else if (motion.kind == MOTION_MECANUM_TARGET) {
    active_command = "mecanum.target";
    apply_mecanum_target_motion(&motion);
  } else if (motion.kind == MOTION_CAN_SERVO_MOVE) {
    active_command = "can_servo.move";
    apply_can_servo_move_motion(&motion);
  } else if (motion.kind == MOTION_CAN_SERVO_GROUP_MOVE) {
    active_command = "can_servo.group_move";
    apply_can_servo_group_move_motion(&motion);
  }
  active_command = "idle";
}

static void handle_can_config(const char *line, int32_t seq) {
  int32_t bitrate_kbps = 1000;
  (void)json_int_or(line, "bitrateKbps", &bitrate_kbps, 1000);
  if (bitrate_kbps <= 0) {
    int32_t bitrate = 1000000;
    (void)json_int_or(line, "bitrate", &bitrate, 1000000);
    bitrate_kbps = bitrate / 1000;
  }
  if (bitrate_kbps < 10 || bitrate_kbps > 1000) {
    send_error(seq, "can.config", "invalid_bitrate", "bitrateKbps must be 10-1000");
    return;
  }
  const uint32_t ok = init_can1_pd0_pd1((uint32_t)bitrate_kbps);
  send_can_feedback(seq, "can.config", ok);
}

static void handle_can_send(const char *line, int32_t seq) {
  int32_t id = 0;
  int32_t len = 8;
  uint32_t extended = 0;
  uint8_t data[CAN_MAX_DLC] = { 0 };
  (void)json_bool(line, "extended", &extended);
  if (!json_int(line, "id", &id) ||
      id < 0 ||
      (!extended && id > (int32_t)CAN_STD_ID_MAX) ||
      (extended && (uint32_t)id > CAN_EXT_ID_MAX)) {
    send_error(seq, "can.send", "invalid_id", "standard id must be 0-2047; extended id must be 0-536870911");
    return;
  }
  (void)json_int_or(line, "dlc", &len, 8);
  if (len < 0 || len > (int32_t)CAN_MAX_DLC) {
    send_error(seq, "can.send", "invalid_dlc", "dlc must be 0-8");
    return;
  }
  for (uint32_t i = 0; i < CAN_MAX_DLC; ++i) {
    char key[3] = { 'b', (char)('0' + i), 0 };
    int32_t byte = 0;
    if (json_int(line, key, &byte)) {
      data[i] = (uint8_t)clamp_i32(byte, 0, 255);
    }
  }
  send_can_feedback(seq, "can.send", can_send_frame((uint32_t)id, extended, data, (uint32_t)len, CAN_TX_TIMEOUT_MS));
  (void)drain_can_rx(seq, CAN_STATUS_RX_DRAIN_MAX);
}

static void handle_can_read(int32_t seq) {
  const uint32_t count = drain_can_rx(seq, CAN_STATUS_RX_DRAIN_MAX);
  if (count == 0u) {
    send_can_feedback(seq, "can.read", 1);
  }
}

static void handle_robomaster_current(const char *line, int32_t seq) {
  int32_t control_id = 0x200;
  int32_t slot = 1;
  int32_t current = 0;
  int32_t duration_ms = 0;
  int32_t interval_ms = 10;
  uint8_t data[CAN_MAX_DLC];
  uint8_t zero[CAN_MAX_DLC] = { 0 };
  uint32_t ok = 1;
  uint32_t sent = 0;
  uint32_t start;

  (void)json_int_or(line, "controlId", &control_id, 0x200);
  (void)json_int_or(line, "slot", &slot, 1);
  if (!json_int(line, "current", &current)) {
    send_error(seq, "can.robomaster.current", "invalid_current", "current is required");
    return;
  }
  (void)json_int_or(line, "durationMs", &duration_ms, 0);
  (void)json_int_or(line, "intervalMs", &interval_ms, 10);

  if (control_id < 0 || control_id > (int32_t)CAN_STD_ID_MAX) {
    send_error(seq, "can.robomaster.current", "invalid_id", "controlId must be 0-2047");
    return;
  }
  if (slot < 1 || slot > 4) {
    send_error(seq, "can.robomaster.current", "invalid_slot", "slot must be 1-4");
    return;
  }

  duration_ms = clamp_i32(duration_ms, 0, 1000);
  interval_ms = clamp_i32(interval_ms, 5, 50);
  build_robomaster_current_frame((uint32_t)slot, current, data);

  if (duration_ms == 0) {
    ok = can_send_standard((uint32_t)control_id, data, CAN_MAX_DLC, CAN_TX_TIMEOUT_MS);
    sent = ok ? 1u : 0u;
  } else {
    start = millis();
    do {
      if (!can_send_standard((uint32_t)control_id, data, CAN_MAX_DLC, CAN_TX_TIMEOUT_MS)) {
        ok = 0;
        break;
      }
      sent++;
      delay_ms((uint32_t)interval_ms);
    } while ((uint32_t)(millis() - start) < (uint32_t)duration_ms);
    (void)can_send_standard((uint32_t)control_id, zero, CAN_MAX_DLC, CAN_TX_TIMEOUT_MS);
  }

  uart_write_str("{\"type\":\"can.feedback\",\"seq\":");
  uart_write_i32(seq);
  uart_write_str(",\"command\":\"can.robomaster.current\",\"ok\":");
  uart_write_str(ok ? "true" : "false");
  uart_write_str(",\"ready\":");
  uart_write_str(can_ready ? "true" : "false");
  uart_write_str(",\"controlId\":");
  uart_write_i32(control_id);
  uart_write_str(",\"slot\":");
  uart_write_i32(slot);
  uart_write_str(",\"current\":");
  uart_write_i32(clamp_i32(current, -20000, 20000));
  uart_write_str(",\"sent\":");
  uart_write_u32(sent);
  uart_write_str(",\"txOk\":");
  uart_write_u32(can_tx_ok);
  uart_write_str(",\"txError\":");
  uart_write_u32(can_tx_error);
  uart_write_str(",\"txTimeout\":");
  uart_write_u32(can_tx_timeout);
  uart_write_str(",\"rxPending\":");
  uart_write_u32(can_rx_pending());
  uart_write_str(",\"esr\":");
  uart_write_u32(CAN_ESR(CAN1_BASE));
  uart_write_str("}\n");
  (void)drain_can_rx(seq, CAN_STATUS_RX_DRAIN_MAX);
}

static void handle_robomaster_stop(const char *line, int32_t seq) {
  int32_t control_id = 0x200;
  uint8_t data[CAN_MAX_DLC] = { 0 };
  (void)json_int_or(line, "controlId", &control_id, 0x200);
  if (control_id < 0 || control_id > (int32_t)CAN_STD_ID_MAX) {
    send_error(seq, "can.robomaster.stop", "invalid_id", "controlId must be 0-2047");
    return;
  }
  send_can_feedback(seq, "can.robomaster.stop", can_send_standard((uint32_t)control_id, data, CAN_MAX_DLC, CAN_TX_TIMEOUT_MS));
}

static void handle_motor_target(const char *line, int32_t seq) {
  PendingMotion motion;
  char mode[8] = "coast";
  int32_t speed = 0;
  uint32_t closed_loop = 0;
  motion.kind = MOTION_MOTOR_TARGET;
  motion.seq = seq;
  motion.priority = motion_priority_from_json(line, COMMAND_PRIORITY_MOTOR);
  motion.motor_index = motor_index_from_json(line);
  motion.target_rpm = 0;
  motion.closed_loop = 0;
  motion.closed_loop_set = 0;
  if (motion.motor_index < 0) {
    send_error(seq, "motor.target", "unsupported_channel", MOTOR_SUPPORT_MESSAGE);
    return;
  }
  if (!json_int(line, "speedPercent", &speed)) {
    send_error(seq, "motor.target", "invalid_speed", "speedPercent is required");
    return;
  }
  (void)json_string(line, "stopMode", mode, sizeof(mode));
  motion.speed_percent = clamp_i32(speed, -100, 100);
  copy_stop_mode(motion.stop_mode, mode);
  if (json_bool(line, "closedLoop", &closed_loop)) {
    motion.closed_loop = closed_loop;
    motion.closed_loop_set = 1;
  }
  (void)json_int_or(line, "targetRpm", &motion.target_rpm, 0);
  queue_motion(motion, "motor.target");
}

static void handle_mecanum_config(const char *line, int32_t seq) {
  int32_t value = 0;
  uint32_t closed_loop = 0;
  if (json_bool(line, "closedLoop", &closed_loop)) {
    mecanum_closed_loop = closed_loop;
  }
  if (json_int(line, "maxRpm", &value) && value > 0) {
    mecanum_max_rpm = (uint32_t)clamp_i32(value, 1, CLOSED_LOOP_MAX_RPM_LIMIT);
  }
  if (json_int(line, "encoderTicksPerRev", &value) && value > 0) {
    mecanum_encoder_ticks_per_rev = (uint32_t)clamp_i32(value, 1, 100000);
  }
  if (json_int(line, "frontLeftDirection", &value)) mecanum_direction[0] = value < 0 ? -1 : 1;
  if (json_int(line, "rearLeftDirection", &value)) mecanum_direction[1] = value < 0 ? -1 : 1;
  if (json_int(line, "rearRightDirection", &value)) mecanum_direction[2] = value < 0 ? -1 : 1;
  if (json_int(line, "frontRightDirection", &value)) mecanum_direction[3] = value < 0 ? -1 : 1;
  send_ack(seq, "mecanum.config");
  send_scheduler_feedback(seq, "mecanum.config", 1, "mecanum config updated");
}

static void handle_mecanum_target(const char *line, int32_t seq) {
  PendingMotion motion;
  char mode[8] = "brake";
  motion.kind = MOTION_MECANUM_TARGET;
  motion.seq = seq;
  motion.priority = motion_priority_from_json(line, COMMAND_PRIORITY_MOTOR);
  (void)json_milli_or(line, "forward", &motion.forward_milli, 0);
  (void)json_milli_or(line, "strafe", &motion.strafe_milli, 0);
  (void)json_milli_or(line, "turn", &motion.turn_milli, 0);
  (void)json_int_or(line, "speedLimitPercent", &motion.speed_limit_percent, 100);
  (void)json_string(line, "stopMode", mode, sizeof(mode));
  motion.forward_milli = clamp_i32(motion.forward_milli, -1000, 1000);
  motion.strafe_milli = clamp_i32(motion.strafe_milli, -1000, 1000);
  motion.turn_milli = clamp_i32(motion.turn_milli, -1000, 1000);
  motion.speed_limit_percent = clamp_i32(motion.speed_limit_percent, 0, 100);
  copy_stop_mode(motion.stop_mode, mode);
  queue_motion(motion, "mecanum.target");
}

static void handle_mecanum_stop(const char *line, int32_t seq) {
  char requested_mode[8] = "brake";
  char mode[8] = "brake";
  (void)json_string(line, "stopMode", requested_mode, sizeof(requested_mode));
  clear_pending_motion("cleared by mecanum.stop");
  copy_stop_mode(mode, requested_mode);
  for (uint32_t index = 0; index < MOTOR_COUNT; index++) {
    apply_motor_stop(index, mode);
  }
  send_ack(seq, "mecanum.stop");
  send_mecanum_feedback(seq, 0, 0, 0, 0, mode, 0, 0, 0, 0);
}

static uint32_t apply_motor_pin_config_from_json(const char *line, int32_t seq, uint32_t index) {
  MotorPins next;
  char value[16];
  uint32_t saw_pin_config = 0;
  uint32_t encoder_a_seen = 0;
  uint32_t encoder_b_seen = 0;
  GpioPin gpio = { 0u, 0u };
  PwmPinConfig pwm = { 0u, 0u, { 0u, 0u } };
  if (index >= MOTOR_COUNT) {
    return 0;
  }
  next = motor_pins[index];

  if (json_string(line, "pwm", value, sizeof(value))) {
    saw_pin_config = 1;
    if (!parse_pwm_pin(value, &pwm)) {
      send_error(seq, "motor.config", "invalid_pin", "pwm pin must be TIM4/TIM5 PWM GPIO");
      return 0;
    }
    next.pwm_timer = pwm.timer;
    next.pwm_channel = pwm.channel;
    next.pwm_port = pwm.gpio.port;
    next.pwm_pin = pwm.gpio.pin;
  }
  if (json_string(line, "in1", value, sizeof(value))) {
    saw_pin_config = 1;
    if (!parse_board_pin(value, &gpio)) {
      send_error(seq, "motor.config", "invalid_pin", "in1 pin is not a Type A GPIO");
      return 0;
    }
    next.in1_port = gpio.port;
    next.in1_pin = gpio.pin;
  }
  if (json_string(line, "in2", value, sizeof(value))) {
    saw_pin_config = 1;
    if (!parse_board_pin(value, &gpio)) {
      send_error(seq, "motor.config", "invalid_pin", "in2 pin is not a Type A GPIO");
      return 0;
    }
    next.in2_port = gpio.port;
    next.in2_pin = gpio.pin;
  }
  if (json_string(line, "enable", value, sizeof(value))) {
    saw_pin_config = 1;
    if (!parse_board_pin(value, &gpio)) {
      send_error(seq, "motor.config", "invalid_pin", "enable pin is not a Type A GPIO");
      return 0;
    }
    next.enable_port = gpio.port;
    next.enable_pin = gpio.pin;
    next.has_enable = 1;
  }
  if (json_string(line, "encoderA", value, sizeof(value))) {
    saw_pin_config = 1;
    encoder_a_seen = 1;
    if (!parse_board_pin(value, &gpio)) {
      send_error(seq, "motor.config", "invalid_pin", "encoderA pin is not a Type A GPIO");
      return 0;
    }
    next.encoder_a_port = gpio.port;
    next.encoder_a_pin = gpio.pin;
  }
  if (json_string(line, "encoderB", value, sizeof(value))) {
    saw_pin_config = 1;
    encoder_b_seen = 1;
    if (!parse_board_pin(value, &gpio)) {
      send_error(seq, "motor.config", "invalid_pin", "encoderB pin is not a Type A GPIO");
      return 0;
    }
    next.encoder_b_port = gpio.port;
    next.encoder_b_pin = gpio.pin;
  }
  if (encoder_a_seen != encoder_b_seen) {
    send_error(seq, "motor.config", "invalid_pin", "encoderA and encoderB must be supplied together");
    return 0;
  }
  if (encoder_a_seen && encoder_b_seen) {
    next.has_encoder = 1;
  }
  if (!saw_pin_config) {
    return 1;
  }
  if (!motor_pins_ready(&next)) {
    send_error(seq, "motor.config", "invalid_pin", "pwm, in1, and in2 pins are required");
    return 0;
  }

  apply_motor_stop(index, "coast");
  motor_pins[index] = next;
  configure_motor_io_for_index(index);
  motor_pwm(index, 0);
  return 1;
}

static void handle_can_servo_config(const char *line, int32_t seq) {
  int32_t bitrate_kbps = 250;
  int32_t id = -1;
  uint32_t apply_to_servo = 0;
  uint8_t data[CAN_MAX_DLC] = { 0 };
  (void)json_int_or(line, "bitrateKbps", &bitrate_kbps, 250);
  (void)json_bool(line, "applyToServo", &apply_to_servo);
  if (apply_to_servo && json_int(line, "id", &id)) {
    data[0] = (uint8_t)clamp_i32(id, 0, 253);
    data[1] = 0x09u;
    data[2] = (uint8_t)asmg_baud_kbps_to_code(bitrate_kbps);
    (void)can_send_asmg(seq, "can_servo.config", data, 1);
    return;
  }
  if (bitrate_kbps < 10 || bitrate_kbps > 1000) {
    send_error(seq, "can_servo.config", "invalid_bitrate", "bitrateKbps must be 10-1000");
    return;
  }
  send_can_feedback(seq, "can_servo.config", init_can1_pd0_pd1((uint32_t)bitrate_kbps));
}

static void handle_can_servo_read(const char *line, int32_t seq) {
  char request[24] = "position_current";
  int32_t id = ASMG_MD_BROADCAST_ID;
  uint8_t data[CAN_MAX_DLC] = { 0 };
  (void)json_string(line, "request", request, sizeof(request));
  (void)json_int_or(line, "id", &id, ASMG_MD_BROADCAST_ID);
  if (str_eq(request, "frames")) {
    if (drain_can_servo_rx(seq, "can_servo.read", CAN_STATUS_RX_DRAIN_MAX) == 0u) {
      send_can_servo_feedback(seq, "can_servo.read", 1, data, 0);
    }
    return;
  }
  if (str_eq(request, "id")) {
    build_asmg_read(data, ASMG_MD_BROADCAST_ID, 0xFDu);
  } else if (str_eq(request, "position")) {
    build_asmg_read(data, id, 0x02u);
  } else if (str_eq(request, "current")) {
    build_asmg_read(data, id, 0x04u);
  } else {
    build_asmg_read(data, id, 0x07u);
  }
  (void)can_send_asmg(seq, "can_servo.read", data, 1);
}

static void handle_can_servo_set_current(const char *line, int32_t seq) {
  int32_t id = -1;
  int32_t current = 0;
  uint8_t data[CAN_MAX_DLC] = { 0 };
  if (!json_int(line, "id", &id) || !json_int(line, "current", &current)) {
    send_error(seq, "can_servo.set_current", "invalid_argument", "id and current are required");
    return;
  }
  build_asmg_u16_command(data, id, 0x03u, current);
  (void)can_send_asmg(seq, "can_servo.set_current", data, 1);
}

static void handle_can_servo_pid(const char *line, int32_t seq) {
  int32_t id = -1;
  int32_t p = 0;
  int32_t i = 0;
  int32_t d = 0;
  uint32_t read = 0;
  uint8_t data[CAN_MAX_DLC] = { 0 };
  if (!json_int(line, "id", &id)) {
    send_error(seq, "can_servo.pid", "invalid_argument", "id is required");
    return;
  }
  (void)json_bool(line, "read", &read);
  if (read) {
    build_asmg_read(data, id, 0x06u);
  } else {
    if (!json_int(line, "p", &p) || !json_int(line, "i", &i) || !json_int(line, "d", &d)) {
      send_error(seq, "can_servo.pid", "invalid_argument", "p, i and d are required");
      return;
    }
    build_asmg_pid(data, id, p, i, d);
  }
  (void)can_send_asmg(seq, "can_servo.pid", data, 1);
}

static void handle_can_servo_set_id(const char *line, int32_t seq) {
  int32_t new_id = -1;
  uint8_t data[CAN_MAX_DLC] = { 0 };
  if (!json_int(line, "newId", &new_id)) {
    send_error(seq, "can_servo.set_id", "invalid_argument", "newId is required");
    return;
  }
  data[0] = (uint8_t)clamp_i32(new_id, 0, 253);
  data[1] = 0xFEu;
  (void)can_send_asmg(seq, "can_servo.set_id", data, 1);
}

static void handle_can_servo_save_center(const char *line, int32_t seq) {
  int32_t id = -1;
  int32_t ratio = 0;
  uint8_t data[CAN_MAX_DLC] = { 0 };
  if (!json_int(line, "id", &id) || !json_int(line, "ratio", &ratio)) {
    send_error(seq, "can_servo.save_center", "invalid_argument", "id and ratio are required");
    return;
  }
  build_asmg_u16_command(data, id, 0x08u, clamp_i32(ratio, ASMG_MD_CENTER_RATIO_MIN, ASMG_MD_CENTER_RATIO_MAX));
  (void)can_send_asmg(seq, "can_servo.save_center", data, 1);
}

static void handle_can_servo_factory_reset(const char *line, int32_t seq) {
  int32_t id = -1;
  uint8_t data[CAN_MAX_DLC] = { 0 };
  if (!json_int(line, "id", &id)) {
    send_error(seq, "can_servo.factory_reset", "invalid_argument", "id is required");
    return;
  }
  build_asmg_read(data, id, 0xFCu);
  (void)can_send_asmg(seq, "can_servo.factory_reset", data, 1);
}

static void handle_can_servo_move(const char *line, int32_t seq) {
  PendingMotion motion;
  motion.kind = MOTION_CAN_SERVO_MOVE;
  motion.seq = seq;
  motion.priority = motion_priority_from_json(line, COMMAND_PRIORITY_CAN_SERVO);
  motion.can_servo_count = 0;
  if (!json_int(line, "id", &motion.can_servo_id) ||
      !json_int(line, "position", &motion.can_servo_position) ||
      !json_int(line, "speed", &motion.can_servo_speed)) {
    send_error(seq, "can_servo.move", "invalid_argument", "id, position and speed are required");
    return;
  }
  motion.can_servo_id = clamp_i32(motion.can_servo_id, 0, 253);
  motion.can_servo_position = clamp_i32(motion.can_servo_position, ASMG_MD_POSITION_MIN, ASMG_MD_POSITION_MAX);
  motion.can_servo_speed = clamp_i32(motion.can_servo_speed, ASMG_MD_SPEED_MIN, ASMG_MD_SPEED_MAX);
  queue_motion(motion, "can_servo.move");
}

static void handle_can_servo_group_move(const char *line, int32_t seq) {
  PendingMotion motion;
  int32_t count = 0;
  int32_t speed = 0;
  motion.kind = MOTION_CAN_SERVO_GROUP_MOVE;
  motion.seq = seq;
  motion.priority = motion_priority_from_json(line, COMMAND_PRIORITY_CAN_SERVO);
  motion.can_servo_count = 0;
  if (!json_int(line, "count", &count) || !json_int(line, "speed", &speed)) {
    send_error(seq, "can_servo.group_move", "invalid_argument", "count and speed are required");
    return;
  }
  if (count < 1 || count > (int32_t)CAN_SERVO_GROUP_MAX_TARGETS) {
    send_error(seq, "can_servo.group_move", "invalid_argument", "count must be 1-8");
    return;
  }
  motion.can_servo_speed = clamp_i32(speed, ASMG_MD_SPEED_MIN, ASMG_MD_SPEED_MAX);
  motion.can_servo_count = (uint32_t)count;
  for (uint32_t index = 0; index < (uint32_t)count; index++) {
    char id_key[16];
    char position_key[16];
    int32_t id = -1;
    int32_t position = 0;
    indexed_json_key(id_key, "id", index);
    indexed_json_key(position_key, "position", index);
    if (!json_int(line, id_key, &id) || !json_int(line, position_key, &position)) {
      send_error(seq, "can_servo.group_move", "invalid_argument", "each target requires idN and positionN");
      return;
    }
    motion.can_servo_targets[index].id = clamp_i32(id, 0, 253);
    motion.can_servo_targets[index].position = clamp_i32(position, ASMG_MD_POSITION_MIN, ASMG_MD_POSITION_MAX);
  }
  queue_motion(motion, "can_servo.group_move");
}

static void handle_binary_can_servo_read(int32_t seq, uint8_t id, uint8_t request_code) {
  uint8_t data[CAN_MAX_DLC] = { 0 };
  if (request_code == 4u) {
    if (drain_can_servo_rx(seq, "can_servo.read", CAN_STATUS_RX_DRAIN_MAX) == 0u) {
      send_can_servo_feedback(seq, "can_servo.read", 1, data, 0);
    }
    return;
  }
  if (request_code == 0u) {
    build_asmg_read(data, ASMG_MD_BROADCAST_ID, 0xFDu);
  } else if (request_code == 1u) {
    build_asmg_read(data, id, 0x02u);
  } else if (request_code == 2u) {
    build_asmg_read(data, id, 0x04u);
  } else {
    build_asmg_read(data, id, 0x07u);
  }
  (void)can_send_asmg(seq, "can_servo.read", data, 1);
}

static void handle_binary_frame(const uint8_t *encoded, uint32_t encoded_len) {
  uint8_t decoded[RX_BINARY_SIZE];
  uint32_t decoded_len = 0;
  int32_t seq = 0;
  uint8_t version;
  uint8_t target_id;
  uint8_t opcode;
  uint8_t flags;
  const uint8_t *payload;
  uint32_t payload_len;
  uint16_t expected_crc;
  uint16_t actual_crc;

  if (!cobs_decode(encoded, encoded_len, decoded, sizeof(decoded), &decoded_len)) {
    binary_cobs_error++;
    send_error(0, "binary", "cobs_error", "COBS decode failed");
    return;
  }
  if (decoded_len < 8u) {
    binary_cobs_error++;
    send_error(0, "binary", "frame_too_short", "binary frame is too short");
    return;
  }

  seq = (int32_t)read_u16_le(&decoded[1]);
  expected_crc = read_u16_le(&decoded[decoded_len - 2u]);
  actual_crc = crc16_ccitt_false(decoded, decoded_len - 2u);
  if (expected_crc != actual_crc) {
    binary_crc_error++;
    send_error(seq, "binary", "crc_error", "CRC16 mismatch");
    return;
  }

  version = decoded[0];
  target_id = decoded[3];
  opcode = decoded[4];
  flags = decoded[5];
  payload = &decoded[6];
  payload_len = decoded_len - 8u;
  (void)flags;
  binary_frames_in++;

  if (version != BINARY_PROTOCOL_VERSION) {
    send_error(seq, "binary", "unsupported_version", "unsupported binary protocol version");
    return;
  }

  if (target_id == BINARY_TARGET_SYSTEM && opcode == BINARY_OPCODE_SYSTEM_PING) {
    send_ack(seq, "system.ping");
    send_protocol_feedback(seq);
    return;
  }

  if (target_id == BINARY_TARGET_SYSTEM && opcode == BINARY_OPCODE_SYNC_MANIFEST_VERSION) {
    send_ack(seq, "system.sync_manifest_version");
    return;
  }

  if (target_id == BINARY_TARGET_BASE && opcode == BINARY_OPCODE_STOP) {
    char mode[8];
    const uint8_t stop_code = payload_len >= 1u ? payload[0] : 0u;
    copy_stop_mode(mode, stop_mode_from_code(stop_code));
    clear_pending_motion("cleared by binary mecanum.stop");
    for (uint32_t index = 0; index < MOTOR_COUNT; index++) {
      apply_motor_stop(index, mode);
    }
    send_ack(seq, "mecanum.stop");
    send_mecanum_feedback(seq, 0, 0, 0, 0, mode, 0, 0, 0, 0);
    return;
  }

  if (target_id == BINARY_TARGET_BASE && opcode == BINARY_OPCODE_MECANUM_VELOCITY) {
    PendingMotion motion;
    char mode[8];
    if (payload_len < 8u) {
      send_error(seq, "mecanum.target", "invalid_argument", "binary mecanum payload is too short");
      return;
    }
    motion.kind = MOTION_MECANUM_TARGET;
    motion.seq = seq;
    motion.priority = COMMAND_PRIORITY_MOTOR;
    motion.forward_milli = clamp_i32((int32_t)read_i16_le(&payload[0]), -1000, 1000);
    motion.strafe_milli = clamp_i32((int32_t)read_i16_le(&payload[2]), -1000, 1000);
    motion.turn_milli = clamp_i32((int32_t)read_i16_le(&payload[4]), -1000, 1000);
    motion.speed_limit_percent = clamp_i32(payload[6], 0, 100);
    copy_stop_mode(mode, stop_mode_from_code(payload[7]));
    copy_stop_mode(motion.stop_mode, mode);
    queue_motion(motion, "mecanum.target");
    return;
  }

  if (target_id == BINARY_TARGET_MOTOR && opcode == BINARY_OPCODE_MOTOR_TARGET) {
    PendingMotion motion;
    char mode[8];
    if (payload_len < 4u || payload[0] < 1u || payload[0] > MOTOR_COUNT) {
      send_error(seq, "motor.target", "invalid_argument", "binary motor payload is invalid");
      return;
    }
    motion.kind = MOTION_MOTOR_TARGET;
    motion.seq = seq;
    motion.priority = COMMAND_PRIORITY_MOTOR;
    motion.motor_index = (int32_t)payload[0] - 1;
    motion.speed_percent = clamp_i32((int32_t)read_i16_le(&payload[1]), -100, 100);
    motion.closed_loop = 0;
    motion.closed_loop_set = 0;
    motion.target_rpm = 0;
    copy_stop_mode(mode, stop_mode_from_code(payload[3]));
    copy_stop_mode(motion.stop_mode, mode);
    queue_motion(motion, "motor.target");
    return;
  }

  if (target_id == BINARY_TARGET_CAN_SERVO_GROUP && opcode == BINARY_OPCODE_CAN_SERVO_GROUP_MOVE) {
    PendingMotion motion;
    uint32_t count;
    uint32_t expected_len;
    if (payload_len < 4u) {
      send_error(seq, "can_servo.group_move", "invalid_argument", "binary CAN group payload is too short");
      return;
    }
    count = payload[0];
    expected_len = 1u + count * 3u + 2u;
    if (count < 1u || count > CAN_SERVO_GROUP_MAX_TARGETS || payload_len < expected_len) {
      send_error(seq, "can_servo.group_move", "invalid_argument", "binary CAN group count is invalid");
      return;
    }
    motion.kind = MOTION_CAN_SERVO_GROUP_MOVE;
    motion.seq = seq;
    motion.priority = COMMAND_PRIORITY_CAN_SERVO;
    motion.can_servo_count = count;
    for (uint32_t index = 0; index < count; index++) {
      const uint32_t offset = 1u + index * 3u;
      motion.can_servo_targets[index].id = clamp_i32(payload[offset], 0, 253);
      motion.can_servo_targets[index].position = clamp_i32(read_u16_le(&payload[offset + 1u]), ASMG_MD_POSITION_MIN, ASMG_MD_POSITION_MAX);
    }
    motion.can_servo_speed = clamp_i32(read_u16_le(&payload[1u + count * 3u]), ASMG_MD_SPEED_MIN, ASMG_MD_SPEED_MAX);
    queue_motion(motion, "can_servo.group_move");
    return;
  }

  if (target_id == BINARY_TARGET_CAN_SERVO && opcode == BINARY_OPCODE_CAN_SERVO_READ) {
    if (payload_len < 2u) {
      send_error(seq, "can_servo.read", "invalid_argument", "binary CAN servo read payload is too short");
      return;
    }
    handle_binary_can_servo_read(seq, payload[0], payload[1]);
    return;
  }

  if (target_id == BINARY_TARGET_IMU && opcode == BINARY_OPCODE_IMU_READ) {
    send_imu_feedback(seq);
    return;
  }

  send_error(seq, "binary", "unsupported_opcode", "binary opcode is not supported");
}

static void handle_command(const char *line) {
  char type[24];
  char mode[8] = "coast";
  int32_t seq = 0;
  if (!json_string(line, "type", type, sizeof(type)) || !json_int(line, "seq", &seq)) {
    send_error(0, "unknown", "invalid_json", "type and seq are required");
    return;
  }

  if (str_eq(type, "system.protocol")) {
    send_protocol_feedback(seq);
    return;
  }

  if (str_eq(type, "system.ping")) {
    send_ack(seq, "system.ping");
    send_protocol_feedback(seq);
    return;
  }

  if (str_eq(type, "debug.set")) {
    uint32_t enabled = 0;
    if (json_bool(line, "enabled", &enabled)) {
      debug_enabled = enabled;
    }
    send_ack(seq, "debug.set");
    return;
  }

  if (str_eq(type, "motor.config")) {
    const int32_t motor_index = motor_index_from_json(line);
    MotorRuntime *state;
    int32_t ticks_per_rev = 0;
    int32_t max_rpm = 0;
    uint32_t closed_loop = 0;
    if (motor_index < 0) {
      send_error(seq, "motor.config", "unsupported_channel", MOTOR_SUPPORT_MESSAGE);
      return;
    }
    state = &motors[(uint32_t)motor_index];
    if (!apply_motor_pin_config_from_json(line, seq, (uint32_t)motor_index)) {
      return;
    }
    if (state->encoder_ticks_per_rev == 0u) {
      state->encoder_ticks_per_rev = ENCODER_TICKS_PER_REV_DEFAULT;
    }
    if (json_int(line, "encoderTicksPerRev", &ticks_per_rev) && ticks_per_rev > 0) {
      state->encoder_ticks_per_rev = (uint32_t)ticks_per_rev;
    }
    if (json_bool(line, "closedLoop", &closed_loop)) {
      state->closed_loop_enabled = closed_loop;
    }
    if (state->closed_loop_max_rpm == 0u) {
      state->closed_loop_max_rpm = CLOSED_LOOP_MAX_RPM_DEFAULT;
    }
    if (json_int(line, "maxRpm", &max_rpm) && max_rpm > 0) {
      state->closed_loop_max_rpm = (uint32_t)clamp_i32(max_rpm, 1, CLOSED_LOOP_MAX_RPM_LIMIT);
    }
    state->configured = motor_pins_ready(&motor_pins[(uint32_t)motor_index]);
    if (!motor_pins[(uint32_t)motor_index].has_encoder) {
      state->closed_loop_enabled = 0;
    }
    reset_motor_encoder((uint32_t)motor_index);
    apply_motor_stop((uint32_t)motor_index, "coast");
    send_ack(seq, "motor.config");
    send_feedback(seq, (uint32_t)motor_index);
    return;
  }

  if (str_eq(type, "motor.target")) {
    handle_motor_target(line, seq);
    return;
  }

  if (str_eq(type, "mecanum.config")) {
    handle_mecanum_config(line, seq);
    return;
  }

  if (str_eq(type, "mecanum.target")) {
    handle_mecanum_target(line, seq);
    return;
  }

  if (str_eq(type, "mecanum.stop")) {
    handle_mecanum_stop(line, seq);
    return;
  }

  if (str_eq(type, "can.config")) {
    handle_can_config(line, seq);
    return;
  }

  if (str_eq(type, "can_servo.config")) {
    handle_can_servo_config(line, seq);
    return;
  }

  if (str_eq(type, "can_servo.move")) {
    handle_can_servo_move(line, seq);
    return;
  }

  if (str_eq(type, "can_servo.group_move")) {
    handle_can_servo_group_move(line, seq);
    return;
  }

  if (str_eq(type, "can_servo.read")) {
    handle_can_servo_read(line, seq);
    return;
  }

  if (str_eq(type, "can_servo.set_current")) {
    handle_can_servo_set_current(line, seq);
    return;
  }

  if (str_eq(type, "can_servo.pid")) {
    handle_can_servo_pid(line, seq);
    return;
  }

  if (str_eq(type, "can_servo.set_id")) {
    handle_can_servo_set_id(line, seq);
    return;
  }

  if (str_eq(type, "can_servo.save_center")) {
    handle_can_servo_save_center(line, seq);
    return;
  }

  if (str_eq(type, "can_servo.factory_reset")) {
    handle_can_servo_factory_reset(line, seq);
    return;
  }

  if (str_eq(type, "can.send")) {
    handle_can_send(line, seq);
    return;
  }

  if (str_eq(type, "can.read")) {
    handle_can_read(seq);
    return;
  }

  if (str_eq(type, "can.robomaster.current")) {
    handle_robomaster_current(line, seq);
    return;
  }

  if (str_eq(type, "can.robomaster.stop")) {
    handle_robomaster_stop(line, seq);
    return;
  }

  if (str_eq(type, "imu.read")) {
    send_imu_feedback(seq);
    return;
  }

  if (str_eq(type, "motor.set")) {
    const int32_t motor_index = motor_index_from_json(line);
    MotorRuntime *state;
    int32_t speed = 0;
    int32_t requested_target_rpm = 0;
    uint32_t requested_closed_loop;
    if (motor_index < 0) {
      send_error(seq, "motor.set", "unsupported_channel", MOTOR_SUPPORT_MESSAGE);
      return;
    }
    state = &motors[(uint32_t)motor_index];
    if (!state->configured) {
      send_error(seq, "motor.set", "unconfigured_channel", "send motor.config before motor commands");
      return;
    }
    if (!json_int(line, "speedPercent", &speed)) {
      send_error(seq, "motor.set", "invalid_speed", "speedPercent is required");
      return;
    }
    requested_closed_loop = state->closed_loop_enabled;
    (void)json_string(line, "stopMode", mode, sizeof(mode));
    if (json_bool(line, "closedLoop", &requested_closed_loop)) {
      state->closed_loop_enabled = requested_closed_loop && motor_pins[(uint32_t)motor_index].has_encoder;
    }
    apply_motor_speed((uint32_t)motor_index, speed, mode);
    if (state->commanded_speed_percent != 0 && json_int(line, "targetRpm", &requested_target_rpm) && requested_target_rpm > 0) {
      state->target_rpm = clamp_i32(requested_target_rpm, 1, (int32_t)CLOSED_LOOP_MAX_RPM_LIMIT);
    }
    send_ack(seq, "motor.set");
    send_feedback(seq, (uint32_t)motor_index);
    return;
  }

  if (str_eq(type, "motor.stop")) {
    char channel[8];
    uint32_t all = 0;
    int32_t motor_index = -1;
    clear_pending_motion("cleared by motor.stop");
    (void)json_string(line, "stopMode", mode, sizeof(mode));
    if (json_bool(line, "all", &all) && all) {
      for (uint32_t index = 0; index < MOTOR_COUNT; index++) {
        apply_motor_stop(index, mode);
      }
      send_ack(seq, "motor.stop");
      for (uint32_t index = 0; index < MOTOR_COUNT; index++) {
        send_feedback(seq, index);
      }
      return;
    }
    if (json_string(line, "channel", channel, sizeof(channel))) {
      motor_index = motor_index_from_channel(channel);
    }
    if (motor_index < 0) {
      send_error(seq, "motor.stop", "unsupported_channel", MOTOR_SUPPORT_MESSAGE);
      return;
    }
    apply_motor_stop((uint32_t)motor_index, mode);
    send_ack(seq, "motor.stop");
    send_feedback(seq, (uint32_t)motor_index);
    return;
  }

  if (str_eq(type, "motor.read")) {
    const int32_t motor_index = motor_index_from_json(line);
    uint32_t all = 0;
    if (json_bool(line, "all", &all) && all) {
      for (uint32_t index = 0; index < MOTOR_COUNT; index++) {
        send_feedback(seq, index);
      }
      return;
    }
    if (motor_index < 0) {
      send_error(seq, "motor.read", "unsupported_channel", MOTOR_SUPPORT_MESSAGE);
      return;
    }
    send_feedback(seq, (uint32_t)motor_index);
    return;
  }

  send_error(seq, type, "unsupported_command", "command is not supported");
}

static void init_systick(void) {
  SYST_RVR = (system_core_hz / 1000u) - 1u;
  SYST_CVR = 0;
  SYST_CSR = (1u << 2) | (1u << 1) | 1u;
}

static void init_pwm_timer(uintptr_t timer) {
  TIM_CR1(timer) = 0;
  TIM_PSC(timer) = 0;
  TIM_ARR(timer) = PWM_PERIOD_COUNTS;
  TIM_CCR1(timer) = 0;
  TIM_CCR2(timer) = 0;
  TIM_CCR3(timer) = 0;
  TIM_CCR4(timer) = 0;
  TIM_CCMR1(timer) = (6u << 4) | (1u << 3) | (6u << 12) | (1u << 11);
  TIM_CCMR2(timer) = (6u << 4) | (1u << 3) | (6u << 12) | (1u << 11);
  TIM_CCER(timer) = 1u | (1u << 4) | (1u << 8) | (1u << 12);
  TIM_EGR(timer) = 1u;
  TIM_CR1(timer) = (1u << 7) | 1u;
}

static void init_pwm_timers(void) {
  RCC_APB1ENR |= (1u << 2) | (1u << 3);
  (void)RCC_APB1ENR;
  init_pwm_timer(TIM4_BASE);
  init_pwm_timer(TIM5_BASE);
}

static void init_motor_runtime(uint32_t index) {
  MotorRuntime *state = &motors[index];
  state->configured = motor_pins_ready(&motor_pins[index]);
  state->commanded_speed_percent = 0;
  state->duty_percent = 0;
  state->direction = "stopped";
  state->stop_mode = "coast";
  state->encoder_ticks_per_rev = ENCODER_TICKS_PER_REV_DEFAULT;
  state->closed_loop_enabled = motor_pins[index].has_encoder ? 1u : 0u;
  state->closed_loop_max_rpm = CLOSED_LOOP_MAX_RPM_DEFAULT;
  state->target_rpm = 0;
  state->control_error_rpm = 0;
  state->control_integral_rpm = 0;
  state->control_duty_percent = 0;
  reset_motor_encoder(index);
}

static void init_motor_io(void) {
  for (uint32_t index = 0; index < MOTOR_COUNT; index++) {
    configure_motor_io_for_index(index);
    init_motor_runtime(index);
    apply_motor_stop(index, "coast");
  }
}

static void init_usart2_pd5_pd6(void) {
  RCC_APB1ENR |= (1u << 17);
  (void)RCC_APB1ENR;
  gpio_alt(GPIOD_BASE, 5, 7, 0);
  gpio_alt(GPIOD_BASE, 6, 7, 1);

  USART_CR1(USART2_BASE) = 0;
  USART_BRR(USART2_BASE) = (system_core_hz + 57600u) / 115200u;
  USART_CR1(USART2_BASE) = (1u << 13) | (1u << 3) | (1u << 2);
}

static void process_uart_rx_value(
  int32_t value,
  char *rx_line,
  uint32_t *rx_len,
  uint8_t *rx_binary,
  uint32_t *rx_binary_len,
  uint32_t *binary_collecting
) {
  const char ch = (char)value;
  if ((uint8_t)value == 0u) {
    if (*binary_collecting && *rx_binary_len > 0u) {
      handle_binary_frame(rx_binary, *rx_binary_len);
      *rx_binary_len = 0;
      *binary_collecting = 0;
    } else {
      *binary_collecting = 1;
      *rx_binary_len = 0;
    }
    return;
  }
  if (*binary_collecting) {
    if (*rx_binary_len < RX_BINARY_SIZE) {
      rx_binary[(*rx_binary_len)++] = (uint8_t)value;
    } else {
      *binary_collecting = 0;
      *rx_binary_len = 0;
      binary_cobs_error++;
      binary_drop_count++;
      send_error(0, "binary", "frame_too_long", "binary frame is too long");
    }
    return;
  }
  if (ch == '\r') {
    return;
  }
  if (ch == '\n') {
    rx_line[*rx_len] = 0;
    if (*rx_len > 0u) {
      handle_command(rx_line);
    }
    *rx_len = 0;
    return;
  }
  if (*rx_len + 1u < RX_LINE_SIZE) {
    rx_line[(*rx_len)++] = ch;
  } else {
    *rx_len = 0;
    send_error(0, "unknown", "line_too_long", "JSON line is too long");
  }
}

int main(void) {
  char rx_line[RX_LINE_SIZE];
  uint8_t rx_binary[RX_BINARY_SIZE];
  uint32_t rx_len = 0;
  uint32_t rx_binary_len = 0;
  uint32_t binary_collecting = 0;

  init_hse_clock_12mhz();

  RCC_AHB1ENR |= (1u << 0) | (1u << 1) | (1u << 2) | (1u << 3) | (1u << 4) | (1u << 5) | (1u << 6) | (1u << 7) | (1u << 8);
  (void)RCC_AHB1ENR;

  gpio_output(GPIOE_BASE, 11);
  gpio_output(GPIOF_BASE, 14);

  init_systick();
  init_pwm_timers();
  init_motor_io();
  init_usart2_pd5_pd6();
  init_can1_pd0_pd1(250);

  led_green(1);
  delay_ms(80);
  led_green(0);
  led_red(1);
  delay_ms(80);
  led_red(0);

  uart_write_str("{\"type\":\"log\",\"message\":\"RoboMaster A motor/CAN controller ready\"}\n");

  while (1) {
    int32_t value;
    while ((value = uart_read_char()) >= 0) {
      process_uart_rx_value(value, rx_line, &rx_len, rx_binary, &rx_binary_len, &binary_collecting);
    }
    poll_next_motor_encoder();
    apply_pending_motion();
    update_closed_loop_control();
  }
}
