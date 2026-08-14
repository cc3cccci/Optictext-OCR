# Adapting Quiet Surface to a new website

## Goal

Make a **different product** feel like the same design family as Quiet Desk —
not a pixel clone of the focus-timer landing.

## Decision tree

```text
Is this the Quiet Desk repo?
  yes → use quiet-desk-design
  no  → use quiet-surface (this)

Does the stack already have Coffee Minimal components?
  yes → reuse barrel imports + token CSS
  no  → port foundations (below) with whatever stack (React, Vue, HTML…)

Multi-theme needed day one?
  yes → full colorway registry
  no  → single palette with same token names (add ways later)
```

## Port steps

### 1. Foundations first (half day)

1. Define CSS variables for minimum or full token set
2. Set fonts: display serif + UI sans
3. Global body: `bg`, `ink`, font-ui
4. Base focus styles

### 2. Primitives second

Implement or map:

- Button primary / ghost / soft
- Card surface
- Input
- Kicker, title, lede utilities
- Icon well

If Coffee components exist in repo, **do not rebuild** — import them.

### 3. Shell third

Pick App shell or Marketing layout from density-and-layout.md  
Ship nav + footer/sign-out before deep features.

### 4. Screens by mode

Build in order of user value, each tagged with a page mode:

```text
Auth → App shell → Dashboard or List → Detail → Settings
```

For content sites:

```text
Landing → Content list → Article
```

### 5. Domain mapping

Write a tiny table in the product skill/docs:

```text
Entity status → token
Priority → token
```

Never assign random hex per status.

### 6. Verify

- [ ] No raw hex in components
- [ ] Primary button only espresso solid
- [ ] Icons accent amber (if multi-theme)
- [ ] Compact only where data density needs it
- [ ] Mobile 390px pass
- [ ] One light + one dark palette if both ship
- [ ] Reduced motion pass

## What to copy from Quiet Desk

| Copy | Skip |
|---|---|
| Token names & roles | Focus timer product logic |
| Card radius, borders, type stacks | Quiet Desk marketing copy |
| Button variants | Theme inertia code (unless you need sheets) |
| Colorway philosophy | Exact 8 palettes (unless brand wants them) |
| Calm voice | Demo metrics |

## Stack recipes

### Already TanStack + Coffee (this monorepo style)

- Keep `styles/colorways.css`, `components/coffee`
- Add routes/pages; new CSS under composition files with tokens only

### shadcn / Radix + Tailwind

- Map shadcn CSS vars → Quiet Surface tokens (`--background`→`--bg`, etc.)
- Override radius to ~0.9–1.1rem for cards; keep pills for buttons
- Prefer stone/zinc warm, not violet defaults

### Other frameworks

- Same tokens in global CSS
- Components are thin wrappers; design rules unchanged

## Branding overrides (safe)

Allowed without breaking the system:

- Swap amber to brand accent **as the amber token** (still one accent)
- Swap display serif to brand serif
- Reduce to 1–2 colorways

Risky (avoid):

- Adding a second loud accent
- Flattening all radii to 4px sharp enterprise without adjusting shadows
- Dark-only pure #000 with gray-500 body text (contrast + cold)

## When Quiet Surface is the wrong tool

- Playful kids’ consumer apps
- Hardcore data terminals (sub-32px rows, dozens of series colors)
- Loud campaign microsites that must feel “noisy on purpose”

Use a different language; don’t stretch Quiet Surface into carnival UI.
