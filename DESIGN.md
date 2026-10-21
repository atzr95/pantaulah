# Pantaulah Design System

## Direction

Operational Clarity. Keep the Malaysia intelligence-terminal identity while making the interface readable on ordinary desktop and mobile displays.

## Typography

- Geist is the body, navigation, and prose face.
- JetBrains Mono is reserved for values, timestamps, status, coordinates, and technical labels.
- Ordinary text is 14px or larger.
- Compact informative text has a 12px target and an absolute 11px floor.
- Uppercase labels use no more than `0.08em` tracking.

## Color and surfaces

- Background: `#071015`
- Panel: `#0d181e`
- Card: `#132129`
- Primary text: `#e9f1f5`
- Muted text: `#a9bac3`
- Dim metadata: `#80949f`
- Active/live signal: `#27d7ee`
- Positive: `#4ddd92`
- Warning: `#ffbd5a`
- Danger: `#ff6b72`
- Neutral slate borders separate surfaces. Cyan borders are only for active or live states.
- One cyan. In CSS use `var(--color-cyan)`, `var(--color-cyan-soft)` (selected tint) or `rgba(var(--color-cyan-rgb), X)` for other alpha steps. Where CSS variables cannot reach (MapLibre paint, canvas, OG images), use `CYAN` / `cyanAlpha()` from `src/lib/ui/colors.ts`. Never write the color as a literal.
- No glow: no colored `text-shadow`, `box-shadow` or `drop-shadow` on text, dots or borders. Dark shadows that keep map labels readable, or lift a popover off the map, are fine. Live dots pulse in scale or opacity only.
- Map fills: neutral metrics use the cyan ramp, concern metrics (where higher is worse, such as crime or prices) use the cyan→amber ramp from `src/lib/data/choropleth.ts`.

## Shared components

Use these instead of building a local copy.

- `PillButton` — every selectable chip or tab in a row (categories, metrics, sub-tabs, days, layers).
- `Dropdown` — every pick-one-from-a-list control. No native `<select>` or date pickers.
- `SidePanel`, `PanelHeader`, `PeekHeader` (`src/components/ui/side-panel.tsx`) — the 400px desktop right panel, its "EYEBROW / CONTEXT + title" header, and the same header as the bottom-sheet peek row.
- `ItemDialog` — details for an item opened from a map or list.
- `BottomSheet` — mobile home for the side panel content.

## Layout

- The map remains the dominant surface.
- Desktop keeps the top category navigation and right intelligence brief.
- Mobile keeps horizontal navigation and the draggable bottom sheet.
- Stronger surface steps and borders replace glow as the main separator.

## Interaction

- Mobile touch targets are at least 44px.
- Desktop controls are at least 36px high when space permits.
- Keyboard focus uses a 2px cyan ring with a 3px offset.
- Motion respects `prefers-reduced-motion`.

## Screen coverage

- National and selected-state explorer across all six statistical categories
- Weather live conditions, forecast, radar, air quality, warnings, floods, and seismic activity
- Media live, trending, Reddit, and news views
- About page
- Loading, empty, partial, stale, error, and offline states
- Desktop 1440×900 and mobile 390×844
