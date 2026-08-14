# Foundations

Portable visual foundations distilled from Quiet Desk / Coffee Minimal v3.1.

## Color token contract

### Full set (recommended for multi-theme products)

```text
bg, bg-soft, surface, surface-solid,
ink, muted, faint,
border, border-hover,
espresso, amber, amber-soft,
sage, sage-soft, blue-soft,
good, warning,
service-codex, service-claude
```

Optional composition helpers: `glow`, `focus-ring`, `shadow-card`.

### Minimum set (single-brand marketing site)

```text
bg, surface, ink, muted, faint, border,
espresso, amber, amber-soft, good, warning, focus-ring
```

Map any omitted tokens to the closest minimum token rather than inventing hex in components.

## Token roles

| Token | Meaning | Typical use |
|---|---|---|
| `bg` | Page canvas | body background |
| `bg-soft` | Quiet wash | hover rows, drawers |
| `surface` | Elevated panel | cards (may be translucent) |
| `surface-solid` | Opaque panel | sheets, menus, inputs |
| `ink` | Primary text | headings, body |
| `muted` | Secondary text | descriptions |
| `faint` | Tertiary | kickers, placeholders |
| `border` | Structure | cards, dividers |
| `border-hover` | Active structure | hover card/input |
| `espresso` | Solid emphasis | primary button, brand mark |
| `amber` | Accent | icons, links hover optional, charts |
| `amber-soft` | Accent wash | icon wells, chips |
| `sage` / `good` | Success / healthy | status, positive delta |
| `warning` | Caution | SLA risk, blocked |
| `blue-soft` / service-* | Cool neutral info | optional tags — use rarely |

## Colorway families (adapt freely)

Ship **1 brand palette** minimum; up to **8** if you want Quiet Desk parity.

| Family | Examples | Feel |
|---|---|---|
| Light warm | Latte, Honey, Clay | Default product, lifestyle |
| Light cool | Mist, Sage, Plum | Tech, health, editorial |
| Dark warm | Charcoal | Night tools |
| Dark cool | Slate | Ops, engineering |

**Rules**

- Dark ways flip `ink`/`espresso` light and `bg` dark
- Accent (`amber`) must remain distinct on both `bg` and `surface`
- Persist active palette before paint if multi-theme
- Palette hex **only** in a colorway CSS/TS layer

## Icon accent policy

For theme-readable icons (recommended):

```css
.icon-well {
  background: var(--amber-soft);
  color: var(--amber);
}
.icon-well svg {
  stroke: currentColor;
  color: inherit;
}
```

Solid chrome (logo tile, primary CTA) stays **espresso / bg** for contrast, not amber fill.

## Typography

| Role | Character | Quiet Desk default | Portable fallback |
|---|---|---|---|
| Display | Literary serif | Iowan / Palatino stack | `"Iowan Old Style", Palatino, Georgia, serif` |
| UI | Neutral sans | Segoe UI / system | `system-ui, "Segoe UI", sans-serif` |

### Scale guide

| Step | Size | Weight | Use |
|---|---|---|---|
| Display | clamp(2.25rem–3.75rem) | 650 | Landing H1 only |
| Title | 1.35–1.75rem | 650 | Page / section |
| Card title | 1.0–1.15rem | 600 | Cards, rows |
| Body | 0.92–1.05rem | 400–500 | Reading |
| Label | 0.72–0.8rem | 650 | Uppercase kickers |
| Metric | 1.5–2rem | 650 | Tabular nums |

- ≤3 type levels inside one card
- Slightly negative tracking on large titles
- Do not add a third family without strong brand need

## Shape & elevation

| Property | Value |
|---|---|
| Card radius | 20–24px (22px canonical) |
| Control radius | 12px (inputs/icon wells) or pill 999px (buttons) |
| Border | 1px `var(--border)` |
| Shadow | soft token; never harsh black 40% |
| Hover lift | 0–3px translateY |

## Spacing scale (4/8-based)

```text
4 8 12 16 20 24 32 40 48 56 64
```

| Context | Gap |
|---|---|
| Inside card | 12–16px |
| Card grids | 16–24px |
| Section stack (marketing) | 40–56px |
| Section stack (app) | 24–32px |
| Page max width (content) | 1040–1200px |
| Reading measure (docs) | 60–72ch |

## Motion

| Kind | ms | Notes |
|---|---|---|
| Hover/focus chrome | 150–220 | color, border |
| Enter | 240–420 | opacity + short translate |
| Sheet / modal | 280–360 | transform; keep mount for exit |
| Progress | 200–700 | rings, bars |

Easing presets:

- Standard: `cubic-bezier(0.22, 1, 0.36, 1)`
- Sheet: `cubic-bezier(0.32, 0.72, 0, 1)`
- Spring snap: `cubic-bezier(0.34, 1.4, 0.64, 1)` (use sparingly)

Always gate decorative motion behind `prefers-reduced-motion`.

## Contrast (WCAG 2.x baseline)

| Pair | Min |
|---|---|
| Body text / bg | 4.5:1 |
| Large text | 3:1 |
| Icons & UI chrome | 3:1 |
| Primary button label | 4.5:1 |

APCA may inform design taste; **compliance** stays WCAG 2.x until WCAG 3 settles.
