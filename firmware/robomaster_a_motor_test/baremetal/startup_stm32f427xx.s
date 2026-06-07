.syntax unified
.cpu cortex-m4
.fpu fpv4-sp-d16
.thumb

.global g_pfnVectors
.global Reset_Handler

.word _sidata
.word _sdata
.word _edata
.word _sbss
.word _ebss

.section .text.Reset_Handler
.weak Reset_Handler
.type Reset_Handler, %function
Reset_Handler:
  ldr r0, =_estack
  mov sp, r0

  ldr r0, =_sdata
  ldr r1, =_edata
  ldr r2, =_sidata
copy_data:
  cmp r0, r1
  bcc copy_data_word
  b zero_bss_start
copy_data_word:
  ldr r3, [r2], #4
  str r3, [r0], #4
  b copy_data

zero_bss_start:
  ldr r0, =_sbss
  ldr r1, =_ebss
  movs r2, #0
zero_bss:
  cmp r0, r1
  bcc zero_bss_word
  bl main
  b .
zero_bss_word:
  str r2, [r0], #4
  b zero_bss

.weak Default_Handler
.type Default_Handler, %function
Default_Handler:
  b .

.macro weak_handler name
  .weak \name
  .set \name, Default_Handler
.endm

weak_handler NMI_Handler
weak_handler HardFault_Handler
weak_handler MemManage_Handler
weak_handler BusFault_Handler
weak_handler UsageFault_Handler
weak_handler SVC_Handler
weak_handler DebugMon_Handler
weak_handler PendSV_Handler
weak_handler SysTick_Handler

.section .isr_vector, "a", %progbits
.type g_pfnVectors, %object
.size g_pfnVectors, .-g_pfnVectors
g_pfnVectors:
  .word _estack
  .word Reset_Handler
  .word NMI_Handler
  .word HardFault_Handler
  .word MemManage_Handler
  .word BusFault_Handler
  .word UsageFault_Handler
  .word 0
  .word 0
  .word 0
  .word 0
  .word SVC_Handler
  .word DebugMon_Handler
  .word 0
  .word PendSV_Handler
  .word SysTick_Handler
