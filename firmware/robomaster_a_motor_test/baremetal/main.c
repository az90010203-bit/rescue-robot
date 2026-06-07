#include <stdint.h>

#define RCC_AHB1ENR (*(volatile uint32_t *)0x40023830u)
#define RCC_APB1ENR (*(volatile uint32_t *)0x40023840u)

#define GPIOA_BASE 0x40020000u
#define GPIOD_BASE 0x40020C00u
#define GPIOE_BASE 0x40021000u
#define GPIOF_BASE 0x40021400u
#define GPIOI_BASE 0x40022000u
#define TIM4_BASE 0x40000800u

#define GPIO_MODER(base) (*(volatile uint32_t *)((base) + 0x00u))
#define GPIO_OTYPER(base) (*(volatile uint32_t *)((base) + 0x04u))
#define GPIO_OSPEEDR(base) (*(volatile uint32_t *)((base) + 0x08u))
#define GPIO_PUPDR(base) (*(volatile uint32_t *)((base) + 0x0Cu))
#define GPIO_BSRR(base) (*(volatile uint32_t *)((base) + 0x18u))
#define GPIO_AFRH(base) (*(volatile uint32_t *)((base) + 0x24u))

#define TIM_CR1(base) (*(volatile uint32_t *)((base) + 0x00u))
#define TIM_EGR(base) (*(volatile uint32_t *)((base) + 0x14u))
#define TIM_CCMR1(base) (*(volatile uint32_t *)((base) + 0x18u))
#define TIM_CCER(base) (*(volatile uint32_t *)((base) + 0x20u))
#define TIM_PSC(base) (*(volatile uint32_t *)((base) + 0x28u))
#define TIM_ARR(base) (*(volatile uint32_t *)((base) + 0x2Cu))
#define TIM_CCR1(base) (*(volatile uint32_t *)((base) + 0x34u))

#define GPIOA_EN (1u << 0)
#define GPIOD_EN (1u << 3)
#define GPIOE_EN (1u << 4)
#define GPIOF_EN (1u << 5)
#define GPIOI_EN (1u << 8)
#define TIM4_EN (1u << 2)

#define PWM_PERIOD_COUNTS 799u
#define TEST_DUTY_COUNTS 120u

static void delay(volatile uint32_t ticks) {
  while (ticks--) {
    __asm volatile("nop");
  }
}

static void delay_ms(uint32_t ms) {
  while (ms--) {
    delay(16000u);
  }
}

static void gpio_output(uintptr_t port, uint32_t pin) {
  const uint32_t shift = pin * 2u;
  GPIO_MODER(port) = (GPIO_MODER(port) & ~(3u << shift)) | (1u << shift);
  GPIO_OTYPER(port) &= ~(1u << pin);
  GPIO_OSPEEDR(port) = (GPIO_OSPEEDR(port) & ~(3u << shift)) | (2u << shift);
  GPIO_PUPDR(port) &= ~(3u << shift);
}

static void gpio_alt(uintptr_t port, uint32_t pin, uint32_t af) {
  const uint32_t mode_shift = pin * 2u;
  const uint32_t af_shift = (pin - 8u) * 4u;
  GPIO_MODER(port) = (GPIO_MODER(port) & ~(3u << mode_shift)) | (2u << mode_shift);
  GPIO_OTYPER(port) &= ~(1u << pin);
  GPIO_OSPEEDR(port) = (GPIO_OSPEEDR(port) & ~(3u << mode_shift)) | (2u << mode_shift);
  GPIO_PUPDR(port) &= ~(3u << mode_shift);
  GPIO_AFRH(port) = (GPIO_AFRH(port) & ~(0xFu << af_shift)) | (af << af_shift);
}

static void gpio_high(uintptr_t port, uint32_t pin) {
  GPIO_BSRR(port) = (1u << pin);
}

static void gpio_low(uintptr_t port, uint32_t pin) {
  GPIO_BSRR(port) = (1u << (pin + 16u));
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

static void motor_pwm(uint32_t duty_counts) {
  if (duty_counts > PWM_PERIOD_COUNTS) {
    duty_counts = PWM_PERIOD_COUNTS;
  }
  TIM_CCR1(TIM4_BASE) = duty_counts;
}

static void motor_stop(void) {
  motor_pwm(0);
  gpio_low(GPIOA_BASE, 2);
  gpio_low(GPIOA_BASE, 3);
  led_green(0);
  led_red(0);
}

static void motor_forward(uint32_t duty_counts) {
  gpio_high(GPIOI_BASE, 5);
  gpio_high(GPIOA_BASE, 2);
  gpio_low(GPIOA_BASE, 3);
  motor_pwm(duty_counts);
  led_green(1);
  led_red(0);
}

static void motor_reverse(uint32_t duty_counts) {
  gpio_high(GPIOI_BASE, 5);
  gpio_low(GPIOA_BASE, 2);
  gpio_high(GPIOA_BASE, 3);
  motor_pwm(duty_counts);
  led_green(0);
  led_red(1);
}

static void init_pwm_pd12_tim4_ch1(void) {
  RCC_APB1ENR |= TIM4_EN;
  (void)RCC_APB1ENR;

  gpio_alt(GPIOD_BASE, 12, 2);

  TIM_CR1(TIM4_BASE) = 0;
  TIM_PSC(TIM4_BASE) = 0;
  TIM_ARR(TIM4_BASE) = PWM_PERIOD_COUNTS;
  TIM_CCR1(TIM4_BASE) = 0;
  TIM_CCMR1(TIM4_BASE) = (6u << 4) | (1u << 3);
  TIM_CCER(TIM4_BASE) = 1u;
  TIM_EGR(TIM4_BASE) = 1u;
  TIM_CR1(TIM4_BASE) = (1u << 7) | 1u;
}

int main(void) {
  RCC_AHB1ENR |= GPIOA_EN | GPIOD_EN | GPIOE_EN | GPIOF_EN | GPIOI_EN;
  (void)RCC_AHB1ENR;

  gpio_output(GPIOA_BASE, 2);
  gpio_output(GPIOA_BASE, 3);
  gpio_output(GPIOI_BASE, 5);
  gpio_output(GPIOE_BASE, 11);
  gpio_output(GPIOF_BASE, 14);

  init_pwm_pd12_tim4_ch1();

  gpio_low(GPIOI_BASE, 5);
  motor_stop();

  for (uint32_t i = 0; i < 3; ++i) {
    led_green(1);
    delay_ms(120);
    led_green(0);
    delay_ms(120);
  }

  while (1) {
    motor_stop();
    delay_ms(2000);

    motor_forward(TEST_DUTY_COUNTS);
    delay_ms(2000);

    motor_stop();
    delay_ms(1000);

    motor_reverse(TEST_DUTY_COUNTS);
    delay_ms(2000);

    motor_stop();
    delay_ms(2000);
  }
}
