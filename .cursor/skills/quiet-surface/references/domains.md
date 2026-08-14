# Domain notes

How to apply Quiet Surface across common website types.

## CRM / sales

| Screen | Mode | Density |
|---|---|---|
| Contacts / companies | List | Compact |
| Contact page | Detail | Comfortable |
| Pipeline | Board | Compact cards |
| Deal forecast | Dashboard | Comfortable |
| Activity log | List inside Detail | Compact |

Status map example:

```text
new        → muted / blue-soft
contacted  → amber
qualified  → sage
won        → good
lost       → faint + warning border optional
```

Avoid a unique hue per pipeline stage. Use **left border / dot** stages at most.

## Admin / internal tools

- Default **compact** lists
- Side nav shell
- Destructive actions require confirm; button stays ghost/warning
- Audit logs: monospace optional for IDs only; don’t switch whole UI to mono

## B2B SaaS marketing + app

- Marketing site: Landing mode, comfortable
- App: App shell + Dashboard/List
- Share **same tokens** across marketing and app so auth handoff feels continuous

## Content / blog / docs

- Content mode; serif display for titles is a strength
- Code blocks: surface-solid + border; syntax colors muted, not neon
- Docs nav sticky, faint labels

## E-commerce

- Product cards = LandingCard-like, soft image top
- Price = metric style tabular
- Cart drawer = sheet pattern
- Keep urgency badges to warning/amber — no flashy timers unless product requires

## Portfolio / agency

- Landing + Content
- Case studies as detail pages
- Prefer Clay/Plum/Latte-like warm ways; avoid noisy motion

## Healthcare / wellness

- Sage family colorway fits
- Extra calm: reduce hover motion; high contrast body
- Avoid alarming red; use warning token carefully

## Fintech / analytics

- Dashboard + Report modes
- Charts: amber primary, one secondary
- Numbers always tabular-nums
- Trust: stable shell, no playful bounce

## Education / courses

- Landing + Content + simple Dashboard (progress)
- Progress rings already on-language (`amber` stroke)

## Multi-tenant enterprise

- Theme may be locked to brand colorway (still tokenized)
- Density compact for power users; offer comfortable in settings if possible
- Do not fork a separate “enterprise theme” with different radii/shadow philosophy

## Combining with Quiet Desk repo components

If building CRM **inside** a Coffee Minimal codebase:

1. Reuse `DashboardCard`, buttons, tokens
2. Add table/board as composition (new components OK) under same CSS tokens
3. Do not restyle Coffee cards with Tailwind color utilities that bypass tokens
