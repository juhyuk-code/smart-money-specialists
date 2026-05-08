---
version: alpha
name: Pref Terminal
description: Minimal dark prediction-market intelligence UI inspired by dense trading tools.
colors:
  canvas: "#060705"
  surface: "#0D100F"
  surface-raised: "#151815"
  surface-soft: "#1A1E1A"
  border: "#343A37"
  text: "#E7E7E2"
  text-muted: "#8D928C"
  text-faint: "#515A55"
  accent: "#61A8FF"
  positive: "#45B98D"
  negative: "#D4505D"
typography:
  display:
    fontFamily: JetBrains Mono
    fontSize: 26px
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: 0
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 1px
  body-compact:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: 0
rounded:
  xs: 2px
  sm: 3px
  md: 4px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
components:
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: 16px
  button:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.xs}"
    padding: 8px
---

## Overview

Pref should feel like a serious market-intelligence terminal: sparse decoration, dense information, and crisp hierarchy. Hyperdash is the reference for the posture: left rail, dark matte surface, compact cards, subtle borders, market-direction color, and fast scanning.

## Colors

Use one interaction accent: blue. Use green and red only for directional market or money movement. Everything else should live in neutral black-green surfaces with low-glare text.

## Typography

Use JetBrains Mono everywhere. Keep labels small and uppercase. Headlines should be compact, not marketing-sized.

## Layout & Spacing

Desktop layouts should be dense and grid-based. Mobile should collapse cleanly to one column without horizontal overflow. Avoid nested cards unless the inner object is a real repeated item.

## Components

Cards should have thin borders, faint inset highlights, and restrained hover states. Buttons should be tactile but quiet. Skeletons should look like preserved structure, never fake clickable data.

## Do's and Don'ts

Do make the Overview the strongest page. Do make market discrepancy visible at a glance. Do keep last useful data when possible.

Do not use fake data, fake fallback records, marketing hero sections, decorative blobs, purple gradients, or user-facing outage/demo language.
