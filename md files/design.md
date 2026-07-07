# design.md — AIXelerate Content OS

## Purpose

This file defines the UI source of truth for AIXelerate Content OS.

Use it for:

- Google Stitch prompts
- Tailwind theme setup
- shadcn/ui customization
- page layouts
- component styling

Do not put backend, auth, database, or security rules here. Those live in `AGENTS.md` and `security-access.md`.

---

## Visual Direction

AIXelerate Content OS should feel like a clean GTM/content operating system.

It should not feel like:

- a generic AI writing toy
- a chatbot wrapper
- a social media growth hack tool
- a playful creator app

Visual style:

- Material 3-inspired SaaS interface
- custom AIXelerate brand identity
- professional B2B operating system
- calm, structured, focused
- dark left sidebar
- white/soft-white main canvas
- clean cards
- light borders
- compact status badges
- clear primary actions
- subtle orange/purple accents
- no emoji
- no generic AI hype

---

## Brand Palette

Core colors:

| Token | Hex | Use |
|---|---|---|
| Brand Orange | `#F84E28` | Primary accent, CTA start, key emphasis |
| Brand Purple | `#BB26F2` | Secondary accent, AI/action emphasis |
| Near Black | `#0A0A0B` | Sidebar, high-emphasis text |
| Soft White | `#FAFAFB` | Main app background |
| Border Grey | `#EBEBEF` | Borders and dividers |
| White | `#FFFFFF` | Cards and panels |

Semantic colors:

| Token | Hex | Use |
|---|---|---|
| Success | `#22C55E` | Approved, completed |
| Warning | `#F59E0B` | Needs attention |
| Danger | `#EF4444` | Error, destructive |
| Info | `#2563EB` | Information |

Signature gradient:

```css
linear-gradient(90deg, #F84E28 0%, #FF6B3D 30%, #D63D8D 65%, #BB26F2 100%)
```

Use gradient only for:

- primary CTA buttons
- active/selected state accents
- important generation actions
- progress indicators

Do not use gradient for:

- full-page backgrounds
- ordinary cards
- table rows
- large app sections

---

## Typography

Fonts:

| Use | Font |
|---|---|
| Headings | Poppins |
| Body/UI | Inter |
| Metadata/code | JetBrains Mono |

Rules:

- Use Poppins for page titles, section titles, and card titles.
- Use Inter for dense app content and form labels.
- Use JetBrains Mono for timestamps, model names, status metadata, IDs, and technical values.

Type scale:

| Token | Size | Use |
|---|---:|---|
| Display XL | 64px | marketing only |
| Display L | 56px | marketing only |
| Display M | 48px | empty states |
| Page Title | 40px | main app page title |
| Section Title | 32px | page sections |
| Card Title | 24px | cards |
| Body Large | 18px | explanatory text |
| Body | 16px | default UI |
| Small | 14px | secondary copy |
| Caption | 12px | badges, metadata |

---

## Layout System

Use an 8px spacing grid.

Common spacing:

- 4px micro gap
- 8px tight
- 12px form internals
- 16px card internals
- 24px section gap
- 32px page section gap
- 48px major separation

Radii:

| Component | Radius |
|---|---:|
| Small controls | 8px |
| Buttons | 10–12px |
| Cards | 12–16px |
| Dialogs | 20–24px |

App shell:

```text
Dark sidebar | Soft white main canvas
```

Sidebar:

- fixed left on desktop
- near black background
- logo at top
- nav below
- user area near bottom

Top bar:

- client switcher
- global search
- command palette trigger
- user menu

Main canvas:

- soft white background
- white cards
- max content width: 1280–1440px
- page padding: 24–32px

---

## Navigation

Primary sidebar labels, in order:

1. Dashboard
2. Research
3. Founder Experiences
4. Ideas
5. Publish
6. Setup

Post Review is not a primary sidebar item — it appears contextually only while viewing that exact post, alongside the primary items above.

Avoid internal implementation terms in UI:

- classifier
- synthesis
- Collected Article
- source_ids_json
- prompt chain
- research_reactions
- trend_only
- business_context_only

Use user-facing terms:

- Collected Article
- TrendCard
- Founder Experience
- Idea
- Post
- Founder Take
- Direction
- Approved for Ideas

---

## Components

### Buttons

Primary:

- gradient background
- white text
- 10–12px radius
- one primary action per page

Use for:

- Run Research Agent
- Generate Ideas
- Generate Post
- Approve Post

Secondary:

- white background
- near black text
- border grey border

Ghost:

- transparent
- subtle hover fill

Danger:

- red/danger styling
- confirmation required

### Cards

Style:

- white background
- 1px `#EBEBEF` border
- 12–16px radius
- subtle shadow only when needed

Card types:

- Metric Card
- Client Card
- Setup Section Card
- Founder Experience Card
- TrendCard
- Idea Card
- Post Review Card
- Publish Queue Card
- Activity Card

### Tables

Use for:

- RSS Sources
- Collected Articles
- TrendCards
- Content Ideas
- Posts
- Audit Logs
- Research Runs

Rules:

- compact rows
- sticky header when useful
- status badges
- row actions
- filters above table
- empty state when no records

### Forms

Use:

- Text input
- Textarea
- Select
- Multi-select
- Tag input
- Toggle
- Checkbox
- Dialog form

Validation:

- inline error below field
- clear success toast
- no raw backend errors

### Badges

Statuses:

- Draft
- Ready
- Review
- Needs Edit
- Approved
- Published
- Rejected
- Archived
- Relevant
- Irrelevant
- Running
- Failed
- Completed
- Owner
- Editor
- Viewer

Badge style:

- compact
- rounded pill
- soft background
- readable contrast

### Dialogs

Use for:

- invite user
- confirm delete
- run research confirmation
- add Founder Experience
- add RSS Source
- approve post
- reject post

### Toasts

Variants:

- success
- warning
- error
- info

Use safe language. Never expose raw stack traces.

### Loading states

Use:

- skeleton cards
- skeleton table rows
- button loading states

Avoid full-page spinners unless necessary.

### Empty states

Each empty state needs:

- clear explanation
- one primary CTA
- optional helper text

---

## Advanced Components

### Command Palette

Shortcut:

```text
Ctrl+K / Cmd+K
```

Actions:

- Switch client
- Go to Dashboard
- Go to Research
- Run Research Agent
- Add RSS Source
- Add Founder Experience
- Generate Ideas
- Open Publish Queue

### Global Search

Eventually search:

- clients
- founder experiences
- collected articles
- TrendCards
- ideas
- posts

v1 can ship with placeholder search UI if full search is not ready.

### Activity Timeline

Show recent events:

- research run completed
- signal approved
- idea generated
- post approved
- post published
- user invited

---

## Page Specifications

### Login

Purpose:

- secure private access

Layout:

- centered card
- AIXelerate logo
- email field
- password field
- login button
- no signup link

Safe copy:

```text
Sign in to AIXelerate Content OS
```

### Client Selector

Purpose:

- choose which client to work on

Components:

- page title
- client cards or table
- role badge
- last updated metadata
- invite/create actions for permitted users

### Dashboard

Purpose:

- show high-level operating status

Cards:

- Setup completeness
- Latest research run
- Collected Articles
- TrendCards
- Ideas ready
- Posts needing review
- Approved posts ready to publish

Primary action:

- context-aware CTA based on next incomplete step

### Setup

Purpose:

- store always-on business context

Sections:

- Business profile
- ICP and offer
- POV and content pillars
- Founder voice
- Proof and reference material
- Banned topics
- Publishing preferences
- Team Access (owner only)

Primary action:

- Save context

Founder Experiences are not part of Setup — see the dedicated Founder Experiences page below.

### Founder Experiences

Purpose:

- log real operator moments as structured setup data, for later use by idea generation

Layout:

- founder entry form at the top (owner/editor only)
- Founder Experience Log below

Founder Experience card fields:

- title
- what happened
- what was learned (if present)
- what changed (if present)
- why it matters (if present)
- created/updated metadata

Primary action:

- Add Founder Experience

Viewer:

- read-only log, no entry form, no edit/archive controls

### Research

Purpose:

- collect articles and synthesize TrendCards

Sections:

1. RSS Sources
2. Run Research Agent
3. Research Runs
4. Collected Articles
5. TrendCards

Primary action:

- Run Research Agent

TrendCard card fields:

- title
- summary
- why buyers care
- confidence score
- source count
- proof notes
- founder take
- approve for ideas

Advanced/debug controls should be collapsed.

### Ideas

Purpose:

- generate and manage Content Ideas

Three primary actions:

- Generate from Founder Experience
- Generate from TrendCard
- Generate from Founder Take

Idea card fields:

- angle
- buyer pain
- commercial relevance
- belief shift
- content pillar
- proof notes
- founder direction
- status

### Post Review

Purpose:

- review one post before approval

Layout:

- left: LinkedIn post preview
- right: review metadata

Metadata:

- buyer belief shift
- proof notes
- risk notes
- CTA intent
- source context used

Actions:

- Needs Edit
- Redraft
- Approve
- Reject

### Publish Queue

Purpose:

- manual publishing

Sections:

- Approved posts ready to copy
- Published history

Actions:

- Copy post text
- Mark as Published

No LinkedIn publishing API.

---

## Responsive Behavior

Desktop:

- full sidebar
- dense dashboard cards
- tables visible

Tablet:

- collapsible sidebar
- two-column cards

Mobile:

- drawer navigation
- stacked cards
- tables become cards where possible
- sticky primary action if useful

No hover-only interactions.

---

## Accessibility

Requirements:

- WCAG AA contrast
- visible focus states
- keyboard-navigable dialogs
- aria labels for icon buttons
- descriptive form errors
- no color-only status communication
- buttons reachable by keyboard

---

## Google Stitch Prompt

Use this prompt in Google Stitch:

```text
Create a Material 3-inspired B2B SaaS web app UI for AIXelerate Content OS.

The app is an ICP-first LinkedIn content operating system for B2B operators and founders. It helps users move from business context to research, TrendCards, Content Ideas, reviewed LinkedIn posts, and a manual publish queue.

Visual direction:
- Clean GTM/content operating system
- Dark left sidebar
- Soft white main canvas
- White cards with light borders
- Compact status badges
- Minimal orange/purple accents
- Premium B2B SaaS feel
- No emoji
- No generic AI hype

Brand:
- Orange: #F84E28
- Purple: #BB26F2
- Near Black: #0A0A0B
- Soft White: #FAFAFB
- Border Grey: #EBEBEF
- Use a restrained orange-to-purple gradient only for primary actions.

Typography:
- Poppins for headings
- Inter for body text
- JetBrains Mono for metadata

Create these screens:
1. Login
2. Client Selector
3. Dashboard
4. Research
5. Founder Experiences
6. Ideas
7. Post Review
8. Publish Queue
9. Setup / Business Context

Navigation:
Dashboard, Research, Founder Experiences, Ideas, Publish, Setup.

Each page should have one primary job and one primary action. Advanced/debug controls should be collapsed.
```

---

## Implementation Notes

- Use Tailwind tokens for all colors.
- Use shadcn/ui as the base component library.
- Do not hardcode random colors.
- Create reusable cards, badges, layout, and table components.
- Keep page files thin.
- Put feature UI inside `src/features/*`.
- Use skeletons for loading states.
- Keep UI copy operator-focused.
