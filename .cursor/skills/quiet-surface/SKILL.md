---
name: quiet-surface
description: >
  Portable product UI system distilled from Quiet Desk / Coffee Minimal v3.1.
  ALWAYS use this skill when the user wants that calm warm restrained look on
  almost any site — marketing, SaaS, CRM, admin, dashboard, settings, docs,
  auth, blog, portfolio, internal tools — or says: Quiet Desk style, Coffee
  Minimal look, adapt this design, make it look like Quiet Desk, warm minimal,
  restrained product UI, CRM UI, pipeline board, soft cards, colorways, amber
  accents, no purple SaaS slop. Covers semantic tokens, 10 page modes,
  comfortable/compact density, tables/forms/nav/board patterns, domain status
  mapping, and porting into a new codebase without copying Quiet Desk content.
  Prefer this over generic design-ui whenever Quiet Desk / Coffee Minimal
  aesthetics are requested for a non–Quiet-Desk product.
metadata:
  short-description: "Portable Quiet Desk / Coffee Minimal style for most sites"
  base: Coffee Minimal v3.1
  source-product: Quiet Desk
  scope: cross-product
  version: "1.0.0"
---

# Quiet Surface

**Quiet Surface** is the **portable design language** behind Quiet Desk: warm
neutrals, semantic colorways, literary display type, soft cards, one accent,
calm motion. It is **not** tied to focus-timer product copy.

Use this skill to make **most websites** feel like the same family — without
forcing a marketing hero onto every CRM screen.

| Skill | When |
|---|---|
| **quiet-surface** (this) | Any new or existing site that should share the look |
| **quiet-desk-design** | Editing the Quiet Desk showcase in this workspace only |
| **coffee-minimal** | Upstream component/token contract & validator |
| **design-ui** | Generic polish; defer to quiet-surface when this look is requested |

Conflict rule: **product-local skill > quiet-surface > coffee-minimal > design-ui**.

## Read order

1. This file — principles, workflow, coverage map
2. [references/foundations.md](references/foundations.md) — tokens, type, shape, color roles
3. [references/page-modes.md](references/page-modes.md) — pick a mode before drawing UI
4. [references/density-and-layout.md](references/density-and-layout.md) — comfortable vs compact shells
5. [references/patterns.md](references/patterns.md) — nav, table, form, board, empty, toast
6. [references/adaptation.md](references/adaptation.md) — port into a new repo step-by-step
7. [references/domains.md](references/domains.md) — CRM, admin, content, commerce notes

## Core principles (non-negotiable)

1. **Hierarchy first** — one dominant action per view; decoration last.
2. **Semantic color only** — components consume tokens (`ink`, `amber`…), never raw palette hex.
3. **Warm restraint** — ivory/stone/parchment families; **no** default purple SaaS gradient.
4. **Two type roles** — display serif stack for titles/metrics; UI sans for chrome/body.
5. **Soft structure** — 20–24px radius cards, low-contrast borders, quiet shadows.
6. **Accent sparingly** — `--amber` for icons, rings, kickers; `--espresso` for solid primary chrome.
7. **Motion is feedback** — 200–350ms, transform/opacity; respect `prefers-reduced-motion`.
8. **Density is a mode** — marketing stays airy; data apps may go compact **without** changing tokens.
9. **Same shell, different page modes** — do not paste the Quiet Desk landing into every product.
10. **Accessible contrast** — WCAG 2.x: body ≥4.5:1, UI/icons ≥3:1; check light and dark colorways.

## What this system is good at

| Site type | Fit | Notes |
|---|---|---|
| Marketing / landing | Excellent | Hero + bento + soft CTA |
| SaaS app shell | Excellent | Nav + cards + settings |
| Dashboard / analytics | Excellent | DashboardCard, rings, sparse charts |
| CRM / pipeline | Strong | Need table/board patterns (see patterns + domains) |
| Admin / back-office | Strong | Compact density + tables |
| Docs / help | Strong | Calm reading width, muted chrome |
| Auth / onboarding | Excellent | Centered card, few providers |
| Blog / editorial | Strong | Serif titles shine; keep UI chrome quiet |
| E-commerce storefront | Good | Use for brand calm; product grid needs care |
| Games / loud consumer | Poor | Wrong tool — use design-ui / game UI skills |
| Dense trading terminals | Poor | Needs harsher density than this language |

## Workflow (every new site)

```text
1. Classify page mode(s)     → references/page-modes.md
2. Pick density              → comfortable (default) | compact (data)
3. Install foundations       → tokens + fonts + colorways (or subset)
4. Build shell               → top nav or side nav from patterns
5. Compose with primitives   → cards, buttons, kickers — not one-off snowflakes
6. Map domain status colors  → good / warning / amber / muted only
7. Verify light + dark way   → Latte (or brand light) + Charcoal/Slate
8. Mobile ~390px             → no overflow; sheets for complex pickers
```

## Foundations snapshot

Copy mindset, not necessarily Quiet Desk filenames:

| Role | Token / rule |
|---|---|
| Canvas | `--bg`, optional soft radial `--glow` |
| Card | `--surface` + `border` + radius 22px |
| Text | `--ink` / `--muted` / `--faint` |
| Primary solid | `--espresso` fill, label `--bg` |
| Accent | `--amber` stroke/text, `--amber-soft` fill |
| Positive / caution | `--good`/`--sage`, `--warning` |
| Focus | `--focus-ring` visible outline |

**19-token colorway contract** when full theming is required — see foundations.
Minimum viable port: single palette implementing the same token names.

## Page modes (choose explicitly)

| Mode | Primary job | Signature layout |
|---|---|---|
| **Landing** | Convert / explain | Hero → feature bento → proof → CTA |
| **App shell** | Navigate product | Sticky top or left nav + main |
| **Dashboard** | Glance metrics | Metric cards + 1 chart + list |
| **List** | Scan / filter records | Toolbar + table/list + bulk |
| **Detail** | Understand one record | Header + tabs/sections + side meta |
| **Board** | Move work in columns | Columns + cards + drag (optional) |
| **Form / settings** | Edit configuration | Grouped fields, quiet save bar |
| **Auth** | Sign in | Centered card, few providers |
| **Content** | Read | Narrow measure, minimal chrome |
| **Report** | Summarize | Score/summary + export/print |

Details: [page-modes.md](references/page-modes.md).

## Anti-slop (portable)

- No neon rainbow gradients, glass soup, or emoji-as-icon
- No 6 competing accent hues for pipeline stages — map stages → existing tokens
- No Inter-only generic look if you can keep the dual stack (serif display + UI)
- No second design system “just for the admin”
- No hero section on every authenticated page

## Port checklist

- [ ] Token names stable; hex only in palette layer
- [ ] Page mode chosen; density chosen
- [ ] One primary button style site-wide
- [ ] Icons Lucide (or one set), accent via `currentColor` + `--amber`
- [ ] Tables/forms use same borders/radius language
- [ ] Empty/loading/error states designed
- [ ] Light + dark (or two colorways) checked
- [ ] Mobile shell usable; reduced-motion safe

## Completion report

ALWAYS report using this template:

```text
## Quiet Surface report
- Site type:
- Page modes:
- Density:
- Colorways:
- Primitives reused / new patterns:
- Contrast checked (pairs):
- Mobile / reduced-motion:
- Domain-specific leftovers:
```
