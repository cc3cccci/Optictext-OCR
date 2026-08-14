# Density & layout shells

Quiet Surface supports two densities. **Tokens stay the same**; spacing and
control size change.

## Densities

| | Comfortable (default) | Compact (data apps) |
|---|---|---|
| Use | Marketing, dashboards, settings | CRM lists, admin tables, boards |
| Card padding | 1.25–1.5rem | 0.75–1rem |
| Row height | ~48–56px | ~36–44px |
| Body size | 0.95–1.05rem | 0.875–0.95rem |
| Grid gap | 1–1.1rem | 0.5–0.75rem |
| Section gap | 2.5–3.5rem | 1.25–2rem |
| Radius | 22px cards | 14–18px table chrome; cards may stay 18–22px |

Rules:

- Do not invent a third density without need
- Compact still needs ≥36px pointer targets (or 44px on touch)
- Never compact the **marketing landing**

## Layout shells

### A. Marketing single column

```text
max-width: 1120px; margin: auto; padding-inline: 1rem;
```

### B. App top-nav

```text
[ full-width topbar ]
[ main max 1200–1440px or fluid with padding ]
```

### C. App side-nav

```text
grid: 240px | 1fr   (≥1024px)
stack: top nav drawer + main  (<1024px)
```

Side nav bg = `bg-soft` or `surface-solid`; active item soft fill.

### D. Split detail

```text
grid: 1fr | 320px   (≥900px)
```

### E. Full-bleed data

Tables may span main width; keep outer page padding 1rem.

## Breakpoints (suggested)

| px | Behavior |
|---|---|
| 390 | Mobile baseline QA |
| 640 | 2-col metrics |
| 900 | Inline theme/picker; split panes |
| 1024 | Side nav permanent |
| 1280 | Wide tables, 4-col metrics |

## Z-index scale

```text
base 0 | sticky nav 40 | dropdown 45 | overlay 50 | toast 60
```

## Scroll & sticky

- Sticky nav with translucent `bg` + blur is on-brand
- Sticky table header: `surface-solid` + bottom border
- Avoid multiple competing stickies

## Responsive content rules

- Cards stack to 1 column before text crushes
- Tables: horizontal scroll **inside** surface, or card-list fallback on mobile
- Filters: collapse into “Filters” sheet on small screens
