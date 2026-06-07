#include <stdint.h>
#include <stddef.h>

#define RCC_AHB1ENR (*(volatile uint32_t *)0x40023830u)

#define GPIOE_BASE 0x40021000u
#define GPIOF_BASE 0x40021400u
#define GPIOG_BASE 0x40021800u

#define GPIO_MODER(base) (*(volatile uint32_t *)((base) + 0x00u))
#define GPIO_OTYPER(base) (*(volatile uint32_t *)((base) + 0x04u))
#define GPIO_OSPEEDR(base) (*(volatile uint32_t *)((base) + 0x08u))
#define GPIO_PUPDR(base) (*(volatile uint32_t *)((base) + 0x0Cu))
#define GPIO_BSRR(base) (*(volatile uint32_t *)((base) + 0x18u))

#define GPIOE_EN (1u << 4)
#define GPIOF_EN (1u << 5)
#define GPIOG_EN (1u << 6)

typedef struct {
  uintptr_t port;
  uint32_t pin;
} LedPin;

static const LedPin kLeds[] = {
    {GPIOG_BASE, 8},
    {GPIOG_BASE, 7},
    {GPIOG_BASE, 6},
    {GPIOG_BASE, 5},
    {GPIOG_BASE, 4},
    {GPIOG_BASE, 3},
    {GPIOG_BASE, 2},
    {GPIOG_BASE, 1},
    {GPIOF_BASE, 14},
    {GPIOE_BASE, 11},
};

static void delay(volatile uint32_t ticks) {
  while (ticks--) {
    __asm volatile("nop");
  }
}

static void gpio_set_output(uintptr_t port, uint32_t pin) {
  const uint32_t shift = pin * 2u;
  GPIO_MODER(port) = (GPIO_MODER(port) & ~(3u << shift)) | (1u << shift);
  GPIO_OTYPER(port) &= ~(1u << pin);
  GPIO_OSPEEDR(port) &= ~(3u << shift);
  GPIO_PUPDR(port) &= ~(3u << shift);
}

static void led_off(const LedPin *led) {
  GPIO_BSRR(led->port) = (1u << led->pin);
}

static void led_on(const LedPin *led) {
  GPIO_BSRR(led->port) = (1u << (led->pin + 16u));
}

static void all_leds_off(void) {
  for (size_t i = 0; i < sizeof(kLeds) / sizeof(kLeds[0]); ++i) {
    led_off(&kLeds[i]);
  }
}

static void show_led(size_t index) {
  all_leds_off();
  led_on(&kLeds[index]);
}

int main(void) {
  RCC_AHB1ENR |= GPIOE_EN | GPIOF_EN | GPIOG_EN;
  (void)RCC_AHB1ENR;

  all_leds_off();
  for (size_t i = 0; i < sizeof(kLeds) / sizeof(kLeds[0]); ++i) {
    gpio_set_output(kLeds[i].port, kLeds[i].pin);
  }
  all_leds_off();

  while (1) {
    for (size_t i = 0; i < sizeof(kLeds) / sizeof(kLeds[0]); ++i) {
      show_led(i);
      delay(650000u);
    }

    for (size_t i = (sizeof(kLeds) / sizeof(kLeds[0])) - 1u; i > 0; --i) {
      show_led(i - 1u);
      delay(650000u);
    }
  }
}
