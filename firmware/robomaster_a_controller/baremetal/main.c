#include <stdint.h>

#define RCC_CR (*(volatile uint32_t *)0x40023800u)
#define RCC_CFGR (*(volatile uint32_t *)0x40023808u)
#define RCC_APB1RSTR (*(volatile uint32_t *)0x40023820u)
#define RCC_AHB1ENR (*(volatile uint32_t *)0x40023830u)
#define RCC_APB1ENR (*(volatile uint32_t *)0x40023840u)
#define RCC_APB2ENR (*(volatile uint32_t *)0x40023844u)

#define GPIOA_BASE 0x40020000u
#define GPIOB_BASE 0x40020400u
#define GPIOD_BASE 0x40020C00u
#define GPIOE_BASE 0x40021000u
#define GPIOF_BASE 0x40021400u
#define GPIOG_BASE 0x40021800u
#define GPIOI_BASE 0x40022000u
#define TIM2_BASE 0x40000000u
#define TIM4_BASE 0x40000800u
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
#define TIM_CCER(base) (*(volatile uint32_t *)((base) + 0x20u))
#define TIM_CNT(base) (*(volatile uint32_t *)((base) + 0x24u))
#define TIM_PSC(base) (*(volatile uint32_t *)((base) + 0x28u))
#define TIM_ARR(base) (*(volatile uint32_t *)((base) + 0x2Cu))
#define TIM_CCR1(base) (*(volatile uint32_t *)((base) + 0x34u))

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
#define CAN_STD_ID_MAX 0x7FFu
#define CAN_EXT_ID_MAX 0x1FFFFFFFu
#define CAN_MAX_DLC 8u
#define CAN_TX_TIMEOUT_MS 30u
#define CAN_STATUS_RX_DRAIN_MAX 8u
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

static volatile uint32_t g_ms;

static uint32_t system_core_hz = 16000000u;
static uint32_t configured;
static uint32_t debug_enabled;
static uint32_t can_ready;
static uint32_t can_bitrate_kbps = 1000;
static uint32_t can_tx_ok;
static uint32_t can_tx_error;
static uint32_t can_tx_timeout;
static uint32_t imu_initialized;
static uint32_t imu_ready;
static uint32_t imu_mpu_whoami;
static uint32_t imu_ist_whoami;
static int32_t commanded_speed_percent;
static uint32_t duty_percent;
static const char *direction = "stopped";
static const char *stop_mode = "coast";
static uint32_t encoder_sample_valid;
static int32_t last_encoder_ticks;
static uint32_t last_encoder_ms;
static uint32_t pulse_hz;
static int32_t encoder_delta;
static const char *encoder_direction = "stopped";
static uint32_t encoder_ticks_per_rev = ENCODER_TICKS_PER_REV_DEFAULT;
static uint32_t speed_rpm;
static uint32_t closed_loop_enabled = 1;
static uint32_t closed_loop_max_rpm = CLOSED_LOOP_MAX_RPM_DEFAULT;
static uint32_t closed_loop_last_ms;
static int32_t target_rpm;
static int32_t control_error_rpm;
static int32_t control_integral_rpm;
static uint32_t control_duty_percent;

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

static uint32_t str_eq(const char *left, const char *right) {
  while (*left && *right && *left == *right) {
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

static uint32_t json_int_or(const char *json, const char *key, int32_t *out, int32_t fallback) {
  if (json_int(json, key, out)) {
    return 1;
  }
  *out = fallback;
  return 0;
}

static uint32_t channel_is_m1(const char *json) {
  char channel[8];
  if (!json_string(json, "channel", channel, sizeof(channel))) {
    return 0;
  }
  return str_eq(channel, "M1") || str_eq(channel, "m1");
}

static void motor_pwm(uint32_t duty_counts) {
  if (duty_counts > PWM_PERIOD_COUNTS) {
    duty_counts = PWM_PERIOD_COUNTS;
  }
  TIM_CCR1(TIM4_BASE) = duty_counts;
}

static void motor_pwm_percent(uint32_t percent) {
  if (percent > 100u) {
    percent = 100u;
  }
  duty_percent = percent;
  control_duty_percent = percent;
  motor_pwm((percent * PWM_PERIOD_COUNTS + 50u) / 100u);
}

static void apply_motor_stop(const char *mode) {
  duty_percent = 0;
  control_duty_percent = 0;
  commanded_speed_percent = 0;
  target_rpm = 0;
  control_error_rpm = 0;
  control_integral_rpm = 0;
  closed_loop_last_ms = 0;
  direction = "stopped";
  stop_mode = str_eq(mode, "brake") ? "brake" : "coast";
  gpio_high(GPIOI_BASE, 5);
  motor_pwm(0);
  if (str_eq(stop_mode, "brake")) {
    gpio_high(GPIOA_BASE, 2);
    gpio_high(GPIOA_BASE, 3);
  } else {
    gpio_low(GPIOA_BASE, 2);
    gpio_low(GPIOA_BASE, 3);
  }
  led_green(0);
  led_red(0);
}

static void apply_motor_speed(int32_t speed, const char *mode) {
  if (speed > 100) {
    speed = 100;
  }
  if (speed < -100) {
    speed = -100;
  }
  if (speed == 0) {
    apply_motor_stop(mode);
    return;
  }

  commanded_speed_percent = speed;
  stop_mode = str_eq(mode, "brake") ? "brake" : "coast";
  target_rpm = (int32_t)(((uint32_t)(speed < 0 ? -speed : speed) * closed_loop_max_rpm + 50u) / 100u);
  control_error_rpm = 0;
  control_integral_rpm = 0;
  closed_loop_last_ms = 0;
  gpio_high(GPIOI_BASE, 5);
  if (speed > 0) {
    direction = "forward";
    gpio_high(GPIOA_BASE, 2);
    gpio_low(GPIOA_BASE, 3);
    led_green(1);
    led_red(0);
  } else {
    direction = "reverse";
    gpio_low(GPIOA_BASE, 2);
    gpio_high(GPIOA_BASE, 3);
    led_green(0);
    led_red(1);
  }
  motor_pwm_percent((uint32_t)(speed < 0 ? -speed : speed));
}

static int32_t encoder_ticks(void) {
  return (int32_t)TIM_CNT(TIM2_BASE);
}

static uint32_t encoder_level(uint32_t pin) {
  return (GPIO_IDR(GPIOA_BASE) >> pin) & 1u;
}

static void update_encoder_metrics(void) {
  const uint32_t now = millis();
  const int32_t ticks = encoder_ticks();
  uint32_t abs_delta;
  if (!encoder_sample_valid) {
    encoder_sample_valid = 1;
    last_encoder_ticks = ticks;
    last_encoder_ms = now;
    encoder_delta = 0;
    encoder_direction = "stopped";
    pulse_hz = 0;
    speed_rpm = 0;
    return;
  }
  const uint32_t elapsed = now - last_encoder_ms;
  if (elapsed < ENCODER_MIN_SAMPLE_MS) {
    return;
  }
  encoder_delta = ticks - last_encoder_ticks;
  encoder_direction = encoder_delta > 0 ? "forward" : encoder_delta < 0 ? "reverse" : "stopped";
  abs_delta = encoder_delta < 0 ? (uint32_t)(-encoder_delta) : (uint32_t)encoder_delta;
  pulse_hz = (uint32_t)(((uint64_t)abs_delta * 1000u) / elapsed);
  speed_rpm = (uint32_t)(((uint64_t)abs_delta * 60000u) / ((uint64_t)elapsed * encoder_ticks_per_rev));
  last_encoder_ticks = ticks;
  last_encoder_ms = now;
}

static void update_closed_loop_control(void) {
  const uint32_t now = millis();
  int32_t error;
  int32_t correction;
  int32_t output;
  int32_t base_duty;

  if (!configured || !closed_loop_enabled || commanded_speed_percent == 0 || target_rpm <= 0) {
    return;
  }
  if (closed_loop_last_ms == 0u) {
    closed_loop_last_ms = now;
    return;
  }
  if ((uint32_t)(now - closed_loop_last_ms) < CLOSED_LOOP_UPDATE_MS) {
    return;
  }
  closed_loop_last_ms = now;

  update_encoder_metrics();
  error = target_rpm - (int32_t)speed_rpm;
  if (error > -CLOSED_LOOP_RPM_DEADBAND && error < CLOSED_LOOP_RPM_DEADBAND) {
    error = 0;
  }
  control_error_rpm = error;
  control_integral_rpm = clamp_i32(control_integral_rpm + error, -CLOSED_LOOP_INTEGRAL_LIMIT_RPM, CLOSED_LOOP_INTEGRAL_LIMIT_RPM);

  base_duty = commanded_speed_percent < 0 ? -commanded_speed_percent : commanded_speed_percent;
  correction = (error / CLOSED_LOOP_KP_DIV) + (control_integral_rpm / CLOSED_LOOP_KI_DIV);
  output = clamp_i32(base_duty + correction, 0, 100);
  motor_pwm_percent((uint32_t)output);
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

static void send_feedback(int32_t seq) {
  update_encoder_metrics();
  uart_write_str("{\"type\":\"motor.feedback\",\"seq\":");
  uart_write_i32(seq);
  uart_write_str(",\"channel\":\"M1\",\"commandedSpeedPercent\":");
  uart_write_i32(commanded_speed_percent);
  uart_write_str(",\"dutyPercent\":");
  uart_write_u32(duty_percent);
  uart_write_str(",\"direction\":\"");
  uart_write_str(direction);
  uart_write_str("\",\"stopMode\":\"");
  uart_write_str(stop_mode);
  uart_write_str("\",\"closedLoop\":");
  uart_write_str(closed_loop_enabled ? "true" : "false");
  uart_write_str(",\"targetRpm\":");
  uart_write_i32(target_rpm);
  uart_write_str(",\"controlDutyPercent\":");
  uart_write_u32(control_duty_percent);
  uart_write_str(",\"controlErrorRpm\":");
  uart_write_i32(control_error_rpm);
  uart_write_str(",\"speedRpm\":");
  uart_write_u32(speed_rpm);
  uart_write_str(",\"encoderTicks\":");
  uart_write_i32(encoder_ticks());
  uart_write_str(",\"pulseHz\":");
  uart_write_u32(pulse_hz);
  uart_write_str(",\"encoderA\":");
  uart_write_u32(encoder_level(0));
  uart_write_str(",\"encoderB\":");
  uart_write_u32(encoder_level(1));
  uart_write_str(",\"encoderDelta\":");
  uart_write_i32(encoder_delta);
  uart_write_str(",\"encoderDirection\":\"");
  uart_write_str(encoder_direction);
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

static void handle_command(const char *line) {
  char type[24];
  char mode[8] = "coast";
  int32_t seq = 0;
  if (!json_string(line, "type", type, sizeof(type)) || !json_int(line, "seq", &seq)) {
    send_error(0, "unknown", "invalid_json", "type and seq are required");
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
    int32_t ticks_per_rev = 0;
    int32_t max_rpm = 0;
    uint32_t closed_loop = 1;
    if (!channel_is_m1(line)) {
      send_error(seq, "motor.config", "unsupported_channel", "A board firmware only supports M1");
      return;
    }
    encoder_ticks_per_rev = ENCODER_TICKS_PER_REV_DEFAULT;
    if (json_int(line, "encoderTicksPerRev", &ticks_per_rev) && ticks_per_rev > 0) {
      encoder_ticks_per_rev = (uint32_t)ticks_per_rev;
    }
    closed_loop_enabled = 1;
    if (json_bool(line, "closedLoop", &closed_loop)) {
      closed_loop_enabled = closed_loop;
    }
    closed_loop_max_rpm = CLOSED_LOOP_MAX_RPM_DEFAULT;
    if (json_int(line, "maxRpm", &max_rpm) && max_rpm > 0) {
      closed_loop_max_rpm = (uint32_t)clamp_i32(max_rpm, 1, CLOSED_LOOP_MAX_RPM_LIMIT);
    }
    configured = 1;
    TIM_CNT(TIM2_BASE) = 0;
    encoder_sample_valid = 0;
    apply_motor_stop("coast");
    send_ack(seq, "motor.config");
    send_feedback(seq);
    return;
  }

  if (str_eq(type, "can.config")) {
    handle_can_config(line, seq);
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

  if (!configured) {
    send_error(seq, type, "unconfigured_channel", "send motor.config before motor commands");
    return;
  }

  if (str_eq(type, "motor.set")) {
    int32_t speed = 0;
    int32_t requested_target_rpm = 0;
    uint32_t requested_closed_loop = closed_loop_enabled;
    if (!channel_is_m1(line)) {
      send_error(seq, "motor.set", "unsupported_channel", "A board firmware only supports M1");
      return;
    }
    if (!json_int(line, "speedPercent", &speed)) {
      send_error(seq, "motor.set", "invalid_speed", "speedPercent is required");
      return;
    }
    (void)json_string(line, "stopMode", mode, sizeof(mode));
    if (json_bool(line, "closedLoop", &requested_closed_loop)) {
      closed_loop_enabled = requested_closed_loop;
    }
    apply_motor_speed(speed, mode);
    if (commanded_speed_percent != 0 && json_int(line, "targetRpm", &requested_target_rpm) && requested_target_rpm > 0) {
      target_rpm = clamp_i32(requested_target_rpm, 1, (int32_t)CLOSED_LOOP_MAX_RPM_LIMIT);
    }
    send_ack(seq, "motor.set");
    send_feedback(seq);
    return;
  }

  if (str_eq(type, "motor.stop")) {
    char channel[8];
    if (json_string(line, "channel", channel, sizeof(channel)) && !(str_eq(channel, "M1") || str_eq(channel, "m1"))) {
      send_error(seq, "motor.stop", "unsupported_channel", "A board firmware only supports M1");
      return;
    }
    (void)json_string(line, "stopMode", mode, sizeof(mode));
    apply_motor_stop(mode);
    send_ack(seq, "motor.stop");
    send_feedback(seq);
    return;
  }

  if (str_eq(type, "motor.read")) {
    if (!channel_is_m1(line)) {
      send_error(seq, "motor.read", "unsupported_channel", "A board firmware only supports M1");
      return;
    }
    send_feedback(seq);
    return;
  }

  send_error(seq, type, "unsupported_command", "command is not supported");
}

static void init_systick(void) {
  SYST_RVR = (system_core_hz / 1000u) - 1u;
  SYST_CVR = 0;
  SYST_CSR = (1u << 2) | (1u << 1) | 1u;
}

static void init_pwm_pd12_tim4_ch1(void) {
  RCC_APB1ENR |= (1u << 2);
  (void)RCC_APB1ENR;
  gpio_alt(GPIOD_BASE, 12, 2, 0);

  TIM_CR1(TIM4_BASE) = 0;
  TIM_PSC(TIM4_BASE) = 0;
  TIM_ARR(TIM4_BASE) = PWM_PERIOD_COUNTS;
  TIM_CCR1(TIM4_BASE) = 0;
  TIM_CCMR1(TIM4_BASE) = (6u << 4) | (1u << 3);
  TIM_CCER(TIM4_BASE) = 1u;
  TIM_EGR(TIM4_BASE) = 1u;
  TIM_CR1(TIM4_BASE) = (1u << 7) | 1u;
}

static void init_encoder_pa0_pa1_tim2(void) {
  RCC_APB1ENR |= 1u;
  (void)RCC_APB1ENR;
  gpio_alt(GPIOA_BASE, 0, 1, 1);
  gpio_alt(GPIOA_BASE, 1, 1, 1);

  TIM_CR1(TIM2_BASE) = 0;
  TIM_PSC(TIM2_BASE) = 0;
  TIM_ARR(TIM2_BASE) = 0xFFFFFFFFu;
  TIM_CNT(TIM2_BASE) = 0;
  TIM_CCMR1(TIM2_BASE) = 1u | (1u << 8);
  TIM_CCER(TIM2_BASE) = 0;
  TIM_SMCR(TIM2_BASE) = 3u;
  TIM_CR1(TIM2_BASE) = 1u;
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

int main(void) {
  char rx_line[RX_LINE_SIZE];
  uint32_t rx_len = 0;

  init_hse_clock_12mhz();

  RCC_AHB1ENR |= (1u << 0) | (1u << 3) | (1u << 4) | (1u << 5) | (1u << 6) | (1u << 8);
  (void)RCC_AHB1ENR;

  gpio_output(GPIOA_BASE, 2);
  gpio_output(GPIOA_BASE, 3);
  gpio_output(GPIOI_BASE, 5);
  gpio_output(GPIOE_BASE, 11);
  gpio_output(GPIOF_BASE, 14);

  init_systick();
  init_pwm_pd12_tim4_ch1();
  init_encoder_pa0_pa1_tim2();
  init_usart2_pd5_pd6();
  init_can1_pd0_pd1(1000);

  gpio_low(GPIOI_BASE, 5);
  apply_motor_stop("coast");

  led_green(1);
  delay_ms(80);
  led_green(0);
  led_red(1);
  delay_ms(80);
  led_red(0);

  uart_write_str("{\"type\":\"log\",\"message\":\"RoboMaster A motor/CAN controller ready\"}\n");

  while (1) {
    update_closed_loop_control();
    const int32_t value = uart_read_char();
    if (value < 0) {
      continue;
    }
    const char ch = (char)value;
    if (ch == '\r') {
      continue;
    }
    if (ch == '\n') {
      rx_line[rx_len] = 0;
      if (rx_len > 0u) {
        handle_command(rx_line);
      }
      rx_len = 0;
      continue;
    }
    if (rx_len + 1u < RX_LINE_SIZE) {
      rx_line[rx_len++] = ch;
    } else {
      rx_len = 0;
      send_error(0, "unknown", "line_too_long", "JSON line is too long");
    }
  }
}
