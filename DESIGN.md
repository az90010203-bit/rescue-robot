---
version: alpha
name: rescue-robot-bright-minimax
description: Bright MiniMax-inspired design system for a practical rescue robot control console. It adapts the MiniMax DESIGN.md language from awesome-design-md into a lighter graphite interface with high readability, structured telemetry, and restrained AI-product accents.
colors:
  ink:
    value: "#0a0a0a"
  charcoal:
    value: "#222222"
  slate:
    value: "#45515e"
  steel:
    value: "#5f5f5f"
  canvas:
    value: "#f7f8fa"
  panel:
    value: "#ffffff"
  panel_soft:
    value: "#f2f3f5"
  hairline:
    value: "#e5e7eb"
  hairline_soft:
    value: "#eaecf0"
  primary:
    value: "#0a0a0a"
  brand_blue:
    value: "#1456f0"
  brand_cyan:
    value: "#3daeff"
  brand_coral:
    value: "#ff5530"
  brand_magenta:
    value: "#ea5ec1"
  brand_purple:
    value: "#a855f7"
  success_bg:
    value: "#e8ffea"
  success_text:
    value: "#1ba673"
  warning:
    value: "#c97700"
  danger:
    value: "#d45656"
radii:
  control:
    value: "9999px"
  compact:
    value: "8px"
  card:
    value: "16px"
  feature:
    value: "20px"
spacing:
  unit:
    value: "4px"
  compact:
    value: "8px"
  regular:
    value: "16px"
  section:
    value: "24px"
---

# Bright MiniMax Rescue Console

## Overview

The UI should feel like a premium AI infrastructure console adapted for rescue robotics: bright graphite canvas, crisp black typography, pill controls, white documentation-style cards, and selective high-energy accent strips. It should not become a dark neon dashboard or a marketing landing page.

The product is a real robot debugging tool. Preserve the working surface: serial status, debug mode, servo library, PWM motor ports, camera gimbal settings, motion command preview, live telemetry, and event log.

## Visual Theme

- Bright, technical, and calm rather than black and glowing.
- Use MiniMax-inspired monochrome structure: near-black anchors, white panels, pale gray sections, strong pill actions.
- Use saturated accents sparingly: blue/cyan for primary command and active module, coral for destructive/urgent actions, magenta/purple only as tiny product-system hints.
- Make data density readable. The interface should support long debugging sessions.

## Typography

- Use DM Sans when available, then Inter/system sans fallbacks.
- Titles are confident but not hero-sized. This is a tool, so no 80px marketing display type.
- Labels use 12-13px with medium or semibold weight.
- Metric values are larger, dark, and compact.
- Code, JSON, and frame previews use system monospace and must wrap safely.

## Layout

- Desktop keeps the operational three-column layout: left device library, center command workspace, right telemetry/log stack.
- Topbar is a compact product/status band.
- Module switching uses pill tabs.
- Mobile collapses to one column with controls staying compact and touch-friendly.
- No horizontal overflow at 390px. JSON, logs, frame previews, and long URLs must wrap or truncate inside their panels.

## Components

- Buttons: pill-shaped. Primary is near-black with cyan/blue edge light. Secondary is white with hairline border. Danger uses coral/red.
- Panels: white or very pale graphite cards with 16px radius, 1px hairline, minimal shadow.
- Status cards: compact white tiles with small colored LEDs.
- Metric cards: white tiles with top micro-label and prominent value. Semantic colors only for normal, warning, and error.
- Logs: dense event stream with low-saturation left rails for TX/RX/SYSTEM/ERROR.
- Camera viewer: pale technical viewport, not a dark void.

## Do

- Keep the rescue robot console immediately usable.
- Keep text high contrast and fatigue-resistant.
- Use color to organize state and priority.
- Use subtle cyan/blue accents to preserve the AI-console feel.
- Keep controls stable in size to avoid layout jumps.

## Don't

- Do not use a very dark background.
- Do not add harsh neon glow.
- Do not copy MiniMax branding, logos, or exact website layouts.
- Do not turn the app into a landing page.
- Do not introduce new UI dependencies.
- Do not change serial, protocol, storage, servo, PWM, or camera gimbal behavior.
