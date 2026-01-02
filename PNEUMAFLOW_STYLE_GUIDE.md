# PneumaFlow UI Style Guide

This guide codifies the visual language extracted from the provided PneumaFlow HTML/CSS snippet (“Pneumatic Silk” aesthetic).

## Design Keywords

- **Deep atmospheric background** with subtle radial glows
- **Stratified glass layers** (blurred translucent cards) over the background
- **Pneumatic motion** (slow drifting background + soft pulsing status dot)
- **High-contrast CTA** (white pill button) against dark UI
- **Uppercase headings + mono metadata** for an “instrument panel” feel

## Design Tokens

### Colors

- **Background (Deep)**: `#06090f`
- **Surface / Silk Primary**: `rgba(230, 245, 255, 0.05)`
- **Silk Border**: `rgba(255, 255, 255, 0.12)`
- **Air Glow (Cyan)**: `#70d8ff`
- **Pressure Blue**: `#2a86ff`
- **Text Main**: `#e0e6ed`
- **Text Dim**: `#8492a6`

### Typography

- **Sans**: `Inter` (weights 300 / 500 / 800)
- **Mono**: `Space Mono` (weights 400 / 700)

Rules:

- **Headings**: heavy weight, tighter tracking, uppercase
- **Metadata**: mono, small size, slightly expanded tracking

### Radii

- **Pneumatic Radius**: `40px` for cards/panels
- **Pill Radius**: `9999px` for status + CTA

### Shadows & Depth

- **Card Shadow**: 
  - `0 10px 30px -10px rgba(0,0,0,0.5)`
  - `inset 0 1px 1px rgba(255,255,255,0.1)`
- **Hover Glow**:
  - `0 20px 40px -15px rgba(112, 216, 255, 0.15)`

### Blur

- **Card Backdrop Blur**: `blur(20px)`

## Layout

### Dashboard Grid

- **Desktop**: `320px | 1fr | 380px` (3 columns)
- **Spacing**: `gap: 2rem`, `padding: 3rem`, `max-width: 1800px`
- **Responsive**: stack to 1 column under ~1200px

## Components

### Pneumatic Card

- Translucent surface + blur + border
- Large radius
- Subtle lift on hover

### AI Status Pill

- Inline-flex pill with cyan-tinted background
- Includes a **pulsing dot** to indicate “active”

### Primary CTA Button (Pneumatic)

- White background, black text
- Pill shape
- Scales slightly on hover with soft glow

### Sleep Score Orb

- Circular surface with subtle radial highlight
- Inset glow + outer glow
- Score uses gradient text (white → cyan)

### Pressure Bars

- Thin bars with `linear-gradient(to top, pressure-blue, transparent)`
- Small periodic height variation (gentle animation)

## Motion

- **Background drift**: very slow linear animation (e.g. 60s) over a repeating pattern
- **Pulse**: 2s ease-in-out scale + opacity

## Implementation Notes (This Repo)

- Theme is implemented via CSS variables in `src/app/globals.css` and consumed via Tailwind color utilities.
- Fonts are loaded via `next/font/google` in `src/app/layout.tsx`.
- Background is rendered as a fixed component under the app shell.
