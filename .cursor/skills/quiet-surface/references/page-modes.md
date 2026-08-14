# Page modes

Pick **one primary mode per screen** before layout. Mixing is allowed (dashboard
contains a list) but one mode owns hierarchy.

## Mode catalog

### 1. Landing (marketing)

**Job:** explain value, one conversion action.

```text
[ sticky nav ]
[ hero: eyebrow · title · subtitle · lede · 1 primary CTA ]
[ logo/social proof optional, quiet ]
[ bento / 3 feature cards ]
[ optional tool demo or metrics strip ]
[ secondary CTA ]
[ footer ]
```

Rules:

- Exactly **one** dominant hero CTA (`espresso` primary)
- Ghost secondary only if needed
- Max one ambient glow card
- Do not put data tables here

### 2. App shell

**Job:** frame authenticated product.

```text
[ topbar: brand · nav · search? · theme · user ]
     or
[ sidebar + top thin bar ]
[ main: page header + content ]
```

Rules:

- Nav labels short; active state = soft bg + ink, not loud underline rainbow
- Theme control: inline ≥900px, sheet <900px if many palettes
- Keep shell borders hairline; main bg = `bg`, panels = `surface`

### 3. Dashboard

**Job:** situational awareness in <10 seconds.

```text
[ page title + primary action ]
[ 3–6 metric cards ]
[ main chart or activity ]
[ secondary list / queue ]
```

Rules:

- Metrics use DashboardCard language: big tabular number + muted label
- Prefer one accent in charts (`amber`); series 2 → `sage` / `muted`
- Avoid 12 equal widgets

### 4. List (index)

**Job:** find and act on many records.

```text
[ title + primary “New” ]
[ filter bar: search, chips, view switch ]
[ table or dense list ]
[ pagination / count ]
```

Rules:

- Toolbar stays one row on desktop; wrap cleanly on mobile
- Row hover = `bg-soft`, not heavy shadow
- Bulk actions appear only when selection > 0
- Status pills: map to good/warning/amber/muted only

### 5. Detail

**Job:** understand and edit one entity.

```text
[ back link ]
[ title + status + primary actions ]
[ tabs or section anchors ]
[ main column fields / activity ]
[ side column meta / people / dates ]
```

Rules:

- Title serif optional; meta UI sans
- Destructive actions ghost/warning, never default primary
- Side column collapses under main on mobile

### 6. Board (kanban)

**Job:** flow work across stages.

```text
[ filters ]
[ columns: title + count ]
[ cards: title, owner, soft meta ]
```

Rules:

- Column headers muted; card = surface radius 16–20px (slightly tighter than marketing 22px is OK)
- Stage color = left border or tiny dot using semantic tokens — not full rainbow cards
- Drag optional; keyboard path required if drag ships

### 7. Form / settings

**Job:** configure without anxiety.

```text
[ title + short lede ]
[ grouped sections ]
[ fields ]
[ sticky or end actions: primary save + ghost cancel ]
```

Rules:

- Labels above fields; help text `faint`/`muted`
- Errors: border warning + text, not only color
- Settings nav: left list on desktop, select/sheets on mobile

### 8. Auth

**Job:** get in securely with low friction.

```text
[ centered surface card ]
[ product mark + title ]
[ providers / form ]
[ legal microcopy ]
```

Rules:

- No marketing bento noise
- One primary path; secondary links quiet
- Same tokens as app (no separate “auth purple”)

### 9. Content / docs

**Job:** read and scan.

```text
[ optional side TOC ]
[ article measure ]
[ quiet code/table styles ]
```

Rules:

- Measure ~65ch; display serif for H1–H2 works well
- Chrome recedes (`faint` nav)

### 10. Report

**Job:** summarize outcome + export.

```text
[ score / summary ]
[ breakdown cards ]
[ print / export actions ]
```

Rules:

- Print CSS hides shell; keeps content
- Score ring or large metric anchors the page

## Mode selection cheat sheet

| User says | Mode |
|---|---|
| “landing page for …” | Landing |
| “CRM contacts” | List (+ Detail) |
| “sales pipeline” | Board (+ Detail) |
| “analytics home” | Dashboard |
| “account settings” | Form/settings |
| “login” | Auth |
| “help center” | Content |
| “weekly summary” | Report |
| “admin panel” | App shell + List/Dashboard |

## Cross-mode rules

- Page header pattern: **kicker (optional) · title · lede · actions**
- Never ship two primary buttons of equal weight
- Empty states belong to the mode (list empty ≠ landing hero)
