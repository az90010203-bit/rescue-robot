# Rescue V2 Electron UI Design

## Product direction

This application is an original rescue-robot performance cockpit. It uses the
visual discipline of an automotive instrument panel—high contrast, precise
geometry, dense telemetry, and a persistent safety action—without using
automotive brands, logos, copied assets, or trademarked interface text.

The former Web Lite UI is retired. This document applies only to the React +
Electron control station. The Python Control Agent and product-level hardware
services continue to own transport, watchdog, limits, and fail-safe behavior.

## Visual language

- Canvas: `#050607`
- Primary surfaces: `#0c0e10`, `#121519`, `#191d21`
- Hairlines: `#2b3137`, strong `#46505a`
- Text: `#f4f6f8`, body `#b7bec5`, muted `#78828b`
- Control blue: `#1c69d4`
- Telemetry cyan: `#27b7d6`
- Safe green: `#26b66f`
- Warning amber: `#f4b400`
- Emergency red: `#e12b1f`

The blue/cyan/red signature rail appears once per major schematic. It is a
Rescue V2 telemetry accent, not an automotive brand mark.

## Typography

- Headings and labels: Bahnschrift or a condensed local sans-serif.
- Chinese interface copy: Microsoft YaHei UI or the system sans-serif.
- Telemetry and codes: Cascadia Mono or Consolas.
- No network fonts. The station must remain complete on an isolated LAN.

## Geometry and hierarchy

- Mostly square corners (0–2 px). Circular forms are reserved for LEDs, joints,
  and schematic pivots.
- No decorative shadows and no generic floating SaaS cards.
- A narrow left rail owns the six product pages.
- The top command bar always shows local Agent state, robot link state, and the
  emergency stop.
- The safety strip stays visible below the command bar.
- Page content uses compact 8/12/16/24 px spacing and thin engineering borders.

## Signature component

The drive page centers an original top-down chassis schematic. It reflects the
operator's current UI intent, drive mode, and speed program. It does not claim
to be motor feedback and does not add a communication field.

## Motion and accessibility

- Motion is limited to 160 ms page entry, status pulses, and active wheel
  energy. All motion stops under `prefers-reduced-motion`.
- Every command remains a native button with an accessible label.
- Focus rings use telemetry cyan and remain visible against all surfaces.
- Red is reserved for failures and emergency stop; green is reserved for
  confirmed healthy state.

## Safety boundary

Visual changes must not alter IPC channels, speed maps, command cadence,
watchdog timing, input release behavior, or Agent authority. Route changes,
window blur, minimize, renderer exit, and application close must still clear
motion through the existing safety path.

## Reference

The structure of this design document and the broad “BMW M” design-language
study were informed by the MIT-licensed
`VoltAgent/awesome-design-md` collection. This implementation is original and
contains no copied logo, image, or proprietary brand asset.
