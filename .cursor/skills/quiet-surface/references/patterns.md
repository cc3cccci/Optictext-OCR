# UI patterns

Reusable patterns that keep non–Quiet-Desk products in-family.

## Buttons

| Variant | Tokens | Use |
|---|---|---|
| Primary | bg `espresso`, color `bg` | One main action |
| Ghost | border + `ink` | Secondary |
| Soft | bg `amber-soft`, color `espresso`, icon `amber` | Tertiary accent |

Pill radius, min-height comfortable 2.75rem / compact 2.25–2.4rem.

## Cards

- Marketing/feature → LandingCard pattern (centered optional icon)
- Metrics → DashboardCard (left-aligned metric)
- Do not create a third public card API if Coffee primitives exist — extend variants

## Kickers

Uppercase, 0.72–0.78rem, weight 650, tracking wide, color `faint` or `amber` for hero only.

## Navigation

**Top:** brand · links · actions  
**Side:** sections with quiet labels  
**Mobile:** Menu drawer + optional Theme sheet  

Active link: `bg-soft` + `ink`, not thick brand underline.

## Search

- Height matches buttons
- Border `border`, focus `focus-ring`
- Results panel: `surface-solid`, radius 16–22px, hairline border

## Tables

```text
[ toolbar ]
[ table ]
  thead: faint/muted labels, bg-soft optional
  tbody: row border-b border, hover bg-soft
  cells: ink primary, muted secondary
[ footer count ]
```

- Align numbers right; tabular-nums
- Actions column: ghost icon buttons
- Selection checkbox uses focus-ring
- No zebra stripes required; if used, extremely subtle `bg-soft`

## Filters & chips

- Idle: ghost border
- Active: `amber-soft` fill + `espresso` text
- Removable chips: clear target ≥24px

## Forms

| Element | Style |
|---|---|
| Label | 0.78rem uppercase or sentence case 0.9rem semibold |
| Input | surface-solid, border, radius 12–14px, min-h 2.5–2.75rem |
| Focus | border-hover + focus-ring |
| Error | warning text + border |
| Hint | faint, 0.82rem |

Group with section title + short lede; 16–20px field gap.

## Status pills

Map domain statuses → tokens:

| Meaning | Tokens |
|---|---|
| Success / won / active | `sage-soft` bg + `sage`/`good` text |
| Caution / at-risk | `amber-soft` + `warning` |
| Neutral / new | `blue-soft` or `bg-soft` + `muted` |
| Critical | prefer `warning` strongly; avoid pure red hex unless tokenized |

Max 1–2 pill styles visible per row.

## Boards

- Column bg = transparent or `bg-soft`
- Card = surface + border; title ink; meta muted
- Optional 3px left accent using stage→token map

## Empty states

```text
[ quiet icon in amber-soft well ]
[ title ]
[ one sentence ]
[ primary or soft CTA ]
```

No illustrations required; if used, muted and on-token.

## Loading

- Skeleton: `border` / soft pulse on `bg-soft`
- Prefer skeleton over spinner for lists
- Reduced motion: static skeleton

## Toasts

- surface-solid, border, card shadow, radius ~16px
- Success/error icon tints only; body stays ink/muted

## Modals & sheets

- Overlay: ink at ~30% opacity
- Desktop modal centered surface-solid
- Mobile complex pickers: bottom sheet with grab handle
- Keep exit animation (don’t `display:none` on frame 0)

## Pagination

- Ghost controls; current page soft fill
- Show range “1–20 of 234” in muted

## Charts

- 1 primary series = `amber`
- Gridlines = `border`
- Axis text = `faint`
- Avoid 3D and heavy gradients
