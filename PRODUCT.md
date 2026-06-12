# Product

## Register

product

## Users

Curious Malaysians and data enthusiasts exploring national statistics casually. Mostly desktop sessions for deep exploration, with significant mobile traffic from shared links. They arrive with curiosity, not a work task: "what's happening in my state?" The interface must reward browsing — fast first paint of the map, obvious entry points (click a state), and live feeds that make the country feel alive.

## Product Purpose

Pantaulah (pantaulah.com) is a real-time intelligence dashboard for Malaysia. It synthesizes official government data across all 16 states and federal territories into an interactive choropleth map with 50+ metrics (economy, crime, health, transport, education, energy) plus live feeds: weather, floods, transit, flights, CCTV, exchange rates, and news. Success looks like a visitor finding a surprising fact about their state within a minute, and coming back when something is happening (floods, fuel price change, breaking news).

## Brand Personality

Command-center, alive, trustworthy. The "Malaysia Intelligence Terminal" identity is deliberate: dark surface, monospace type, cyan signal color, scan-line texture, boot sequence. It should feel like operating a national monitoring console — playful in framing, serious in data accuracy. Refine within this identity; do not dilute it into a generic dashboard.

## Anti-references

- Generic SaaS admin templates (white cards on gray, shadcn-default look).
- Corporate government portals: dense bureaucratic chrome, PDF-energy.
- Crypto-terminal neon overload: glow everywhere, legibility sacrificed for vibe.
- Identical stat-card grids with big number + tiny label repeated endlessly.

## Design Principles

1. **The map is the product.** Every other element supports orientation around the choropleth; nothing competes with it for attention.
2. **Live beats static.** Real-time feeds (transit, weather, flights, ticker) are the differentiator; surface their liveness (timestamps, pulse indicators) honestly.
3. **Density with hierarchy.** Terminal aesthetics permit high information density, but every panel needs one clear primary read before detail.
4. **Honest data.** Show data vintage (2022 vs live) plainly; never imply freshness that isn't there.
5. **Refine the terminal, don't escape it.** Improvements sharpen legibility and polish inside the established identity.

## Accessibility & Inclusion

Sensible defaults, no formal compliance target: WCAG AA contrast where practical on the dark surface, `prefers-reduced-motion` respected for scan lines / pulses / ticker, color-blind-safe choropleth ramps (avoid pure red-green encodings), touch targets ≥44px on mobile.
