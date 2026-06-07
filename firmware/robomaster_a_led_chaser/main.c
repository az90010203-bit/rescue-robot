#include "stm32f4xx_hal.h"
#include <stddef.h>

typedef struct {
  GPIO_TypeDef *port;
  uint16_t pin;
} LedPin;

static const LedPin kLeds[] = {
    {GPIOG, GPIO_PIN_8},
    {GPIOG, GPIO_PIN_7},
    {GPIOG, GPIO_PIN_6},
    {GPIOG, GPIO_PIN_5},
    {GPIOG, GPIO_PIN_4},
    {GPIOG, GPIO_PIN_3},
    {GPIOG, GPIO_PIN_2},
    {GPIOG, GPIO_PIN_1},
    {GPIOF, GPIO_PIN_14},
    {GPIOE, GPIO_PIN_11},
};

static const GPIO_PinState LED_ON = GPIO_PIN_RESET;
static const GPIO_PinState LED_OFF = GPIO_PIN_SET;

static void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void Error_Handler(void);
static void set_all_leds(GPIO_PinState state);
static void show_led(size_t index);

int main(void) {
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();

  while (1) {
    for (size_t i = 0; i < sizeof(kLeds) / sizeof(kLeds[0]); ++i) {
      show_led(i);
      HAL_Delay(80);
    }

    for (size_t i = (sizeof(kLeds) / sizeof(kLeds[0])) - 1; i > 0; --i) {
      show_led(i - 1);
      HAL_Delay(80);
    }
  }
}

static void MX_GPIO_Init(void) {
  GPIO_InitTypeDef GPIO_InitStruct = {0};

  __HAL_RCC_GPIOE_CLK_ENABLE();
  __HAL_RCC_GPIOF_CLK_ENABLE();
  __HAL_RCC_GPIOG_CLK_ENABLE();

  set_all_leds(LED_OFF);

  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;

  GPIO_InitStruct.Pin =
      GPIO_PIN_1 | GPIO_PIN_2 | GPIO_PIN_3 | GPIO_PIN_4 |
      GPIO_PIN_5 | GPIO_PIN_6 | GPIO_PIN_7 | GPIO_PIN_8;
  HAL_GPIO_Init(GPIOG, &GPIO_InitStruct);

  GPIO_InitStruct.Pin = GPIO_PIN_14;
  HAL_GPIO_Init(GPIOF, &GPIO_InitStruct);

  GPIO_InitStruct.Pin = GPIO_PIN_11;
  HAL_GPIO_Init(GPIOE, &GPIO_InitStruct);
}

static void set_all_leds(GPIO_PinState state) {
  for (size_t i = 0; i < sizeof(kLeds) / sizeof(kLeds[0]); ++i) {
    HAL_GPIO_WritePin(kLeds[i].port, kLeds[i].pin, state);
  }
}

static void show_led(size_t index) {
  set_all_leds(LED_OFF);
  HAL_GPIO_WritePin(kLeds[index].port, kLeds[index].pin, LED_ON);
}

static void SystemClock_Config(void) {
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  __HAL_RCC_PWR_CLK_ENABLE();
  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);

  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSE;
  RCC_OscInitStruct.HSEState = RCC_HSE_ON;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
  RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSE;
  RCC_OscInitStruct.PLL.PLLM = 6;
  RCC_OscInitStruct.PLL.PLLN = 168;
  RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
  RCC_OscInitStruct.PLL.PLLQ = 4;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK) {
    Error_Handler();
  }

  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK |
                                RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV4;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV2;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_5) != HAL_OK) {
    Error_Handler();
  }

  HAL_SYSTICK_Config(HAL_RCC_GetHCLKFreq() / 1000);
  HAL_SYSTICK_CLKSourceConfig(SYSTICK_CLKSOURCE_HCLK);
  HAL_NVIC_SetPriority(SysTick_IRQn, 0, 0);
}

static void Error_Handler(void) {
  __disable_irq();
  while (1) {
  }
}
