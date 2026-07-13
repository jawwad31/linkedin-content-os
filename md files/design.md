## 1. Purpose and Authority

“The production application determines what exists and how it works. The UI references determine how it should look and feel.”

This document outlines the visual system, layout approach, and reusable styles for the UI refresh. The approved PNG screenshots and Stitch HTML/code exports in `ui-reference/` serve strictly as design-language references illustrating the color system, tonal surfaces, typography, component proportions, spacing, layout patterns, and states (loading, empty, error, and interaction). They are not authoritative definitions of feature inventories, product functionality, routes, workflow behaviors, role permissions, or backend capabilities. Do not use this document to redesign authentication, database schemas, API contracts, permissions, routes, research logic, or publishing workflows. Those rules remain in `AGENTS.md`, `security-access.md`, feature tickets, migrations, and the existing codebase.

### Source-of-truth order

When sources appear to conflict, use this exact priority order:

1. Existing production behavior, security rules, permissions, routes, data contracts, workflow requirements, and RLS.
2. Approved PNG references for the visual appearance of covered screens.
3. Google Stitch HTML/code for measurements, spacing, layout structure, component grouping, and responsive implementation reference.
4. `design.md` for reusable design-system rules, implementation constraints, and screens without a direct reference.

Explicit rules:
- When PNG and Stitch HTML differ visually, follow the PNG.
- When a reference conflicts with production behavior, preserve production behavior and adapt the design around it.
- PNGs are visual acceptance targets, not product specifications.
- Do not copy mock data or unsupported prototype functionality.

---

## 2. Approved Visual References

Use the following actual visual references from the repository:

| File path | Screen | Production Route | Coverage |
|---|---|---|---|
| `ui-reference/login_m3_updated_colors/05_login.png` | Login | `/login` | Covered |
| `ui-reference/client_selector_material_3/03_client_selector.png` | Client Selector | `/clients` | Covered |
| `ui-reference/dashboard_m3_updated_colors/01_dashboard.png` | Overview | `/client/[client_id]/dashboard` | Covered |
| `ui-reference/research_m3_updated_colors/02_research_hub.png` | Research | `/client/[client_id]/research` | Covered |
| None | Founder Knowledge | `/client/[client_id]/founder-experiences` | Uncovered |
| `ui-reference/ideas_material_3/04_ideas.png` | Ideas | `/client/[client_id]/ideas` | Covered |
| None | Posts | `/client/[client_id]/posts` | Uncovered |
| `ui-reference/post_review_m3_updated_colors/06_post_review.png` | Post Review | `/client/[client_id]/posts/[post_id]/review` | Covered |
| `ui-reference/publish_queue_material_3/07_publish_queue.png` | Publish | `/client/[client_id]/publish` | Covered |
| `ui-reference/setup_material_3/08_business_context_setup.png` | Settings | `/client/[client_id]/settings` | Covered |

Implementation should preserve the same visual character at other viewport sizes rather than hardcoding these dimensions.

### Reference-only elements

Some screenshot content is illustrative. Apply these constraints:

- Publish remains LinkedIn-only and manual unless another channel is already supported by the product.
- Do not add Twitter, Instagram, or auto-publishing merely because a reference card displays them.
- Login remains private. Do not expose public signup or workspace creation unless that route is intentionally enabled.
- Founder Experiences remain a real product workflow. The Setup screen may show a summary module, but full management belongs on its dedicated route or existing workflow.
- Do not add fake metrics, research runs, posts, proof, clients, users, or workspaces.

## 3. Visual Direction

AIXelerate Content OS is a professional B2B operating system for turning business context and market intelligence into reviewed LinkedIn content.

The interface should feel:

- structured and operational
- premium without being ornamental
- calm, dense, and highly scannable
- Material 3-inspired
- unmistakably AIXelerate through orange, purple, and warm tonal surfaces
- suitable for founders, marketers, operators, and agency teams

It should not feel like:

- a generic AI chatbot wrapper
- a playful creator app
- a social growth-hack dashboard
- a consumer social scheduler
- a neon cyberpunk interface
- an analytics dashboard filled with invented numbers

### Core visual characteristics

- near-black fixed sidebar on desktop
- warm off-white main canvas
- warm peach tonal containers rather than cold grey panels
- pill-shaped navigation states and primary controls
- compact cards with clear internal hierarchy
- orange for operational and primary emphasis
- purple for research, intelligence, ideation, and selected states
- restrained orange-to-purple gradient for generation and high-priority actions
- subtle borders and ambient shadows
- no emoji
- no decorative AI sparkles unless they communicate an actual AI action

---

## 4. Design Tokens

### 4.1 Core palette

| Token | Hex | Use |
|---|---|---|
| `sidebar` | `#0A0A0B` | Desktop navigation shell |
| `background` | `#FFF8F6` | Main app background |
| `surface` | `#FDF8F7` | Default page surface |
| `surface-container-lowest` | `#FFFFFF` | White cards, dialogs, inputs |
| `surface-container-low` | `#FFF0ED` | Top bar, subtle sections |
| `surface-container` | `#FFE9E4` | Metric and featured cards |
| `surface-container-high` | `#FFE2DB` | Nested and selected containers |
| `surface-container-highest` | `#FADCD5` | Strong tonal separation |
| `surface-variant` | `#F4E0DB` | Chips and subdued regions |
| `outline` | `#79747E` | High-emphasis outlines |
| `outline-variant` | `#E4BEB5` | Card borders and dividers |
| `on-surface` | `#1C1B1D` | Primary text |
| `on-surface-variant` | `#5B403A` | Secondary text |
| `primary` | `#F84E28` | Main actions and operational emphasis |
| `primary-dark` | `#B22300` | High-contrast orange text or states |
| `secondary` | `#BB26F2` | Intelligence and ideation emphasis |
| `secondary-dark` | `#9600C7` | Strong purple states |
| `tertiary` | `#613ED3` | Supporting data accents |
| `success` | `#22C55E` | Completed, approved, healthy |
| `warning` | `#F59E0B` | Needs attention |
| `danger` | `#EF4444` | Error and destructive action |
| `info` | `#2563EB` | Informational state |

### 4.2 Signature gradient

```css
linear-gradient(
  90deg,
  #F84E28 0%,
  #FF6B3D 30%,
  #D63D8D 65%,
  #BB26F2 100%
)
```

Use the gradient only for:

- the highest-priority generation action
- selected high-value actions
- compact progress indicators
- brand marks or controlled highlights

Do not use it for:

- full-page backgrounds
- ordinary cards
- table rows
- large content areas
- every button on a page

### 4.3 Suggested CSS variables

```css
:root {
  --sidebar: #0a0a0b;
  --background: #fff8f6;
  --surface: #fdf8f7;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #fff0ed;
  --surface-container: #ffe9e4;
  --surface-container-high: #ffe2db;
  --surface-container-highest: #fadcd5;
  --surface-variant: #f4e0db;
  --outline: #79747e;
  --outline-variant: #e4beb5;
  --on-surface: #1c1b1d;
  --on-surface-variant: #5b403a;
  --primary: #f84e28;
  --primary-dark: #b22300;
  --secondary: #bb26f2;
  --secondary-dark: #9600c7;
  --tertiary: #613ed3;
  --success: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #2563eb;
}
```

---

## 5. Typography

### Font family

The approved interface uses **Roboto Flex** for headings, UI copy, labels, and metadata.

```css
font-family: "Roboto Flex", Inter, ui-sans-serif, system-ui, sans-serif;
```

Do not mix Poppins, Inter, and Roboto Flex across different screens. Use one consistent family. Technical identifiers may use a monospace font only when the value genuinely benefits from fixed-width characters.

### Type scale

| Role | Size / line height | Weight | Use |
|---|---:|---:|---|
| Display Large | 57 / 64px | 400–600 | Rare hero or empty-state heading |
| Display Medium | 45 / 52px | 400–600 | Large onboarding state |
| Display Small | 36 / 44px | 500–700 | Major page greeting |
| Headline Large | 32 / 40px | 500–700 | Desktop page title |
| Headline Medium | 28 / 36px | 500–700 | Mobile page title, major section |
| Headline Small | 24 / 32px | 500–700 | Section heading |
| Title Large | 22 / 28px | 500–700 | Card group title |
| Title Medium | 16 / 24px | 500–700 | Card title, input group title |
| Title Small | 14 / 20px | 500–700 | Dense card title |
| Body Large | 16 / 24px | 400–500 | Main explanatory copy |
| Body Medium | 14 / 20px | 400–500 | Default UI copy |
| Body Small | 12 / 16px | 400–500 | Supporting text |
| Label Large | 14 / 20px | 500–700 | Buttons, nav labels |
| Label Medium | 12 / 16px | 500–700 | Badges and metadata |
| Label Small | 11 / 16px | 500–700 | Compact status labels |

### Typography rules

- Page titles should usually be 28–32px, not oversized marketing headings.
- Use bold weight selectively for hierarchy, not for all text.
- Secondary copy uses `on-surface-variant`.
- Avoid uppercase paragraph text.
- Statuses may use short uppercase labels only when the reference component requires it.
- Truncate long card titles to two lines where necessary, with the full value available through accessible text or detail view.

---

## 6. Iconography

Preferred icon style: **Material Symbols Outlined**.

- Standard icon size: 24px.
- Dense list icon size: 18–20px.
- Filled state is allowed for the current active item or a selected control.
- Every icon-only button requires an accessible label and tooltip.
- Do not mix multiple icon families within the same interface.

When the existing project is already standardized on Lucide, use the closest Lucide equivalents consistently rather than introducing a second icon dependency for isolated screens.

---

## 7. Layout System

### Spacing

Use a 4px baseline grid with an 8px visual rhythm.

| Token | Value | Use |
|---|---:|---|
| Micro | 4px | Icon/text adjustment |
| Tight | 8px | Compact control spacing |
| Small | 12px | Form internals |
| Base | 16px | Card padding and standard gaps |
| Medium | 24px | Grid gutters and section gaps |
| Large | 32px | Page padding and major separation |
| XL | 48px | Empty states and major section breaks |

### Shape

| Component | Radius |
|---|---:|
| Small control | 8px |
| Input | 8–10px |
| Standard button | 10–12px |
| Card | 12–16px |
| Featured panel | 16px |
| Dialog | 20–24px |
| Navigation item / chip | 9999px |

### Elevation

- Default cards use tonal separation and a 1px border.
- Standard shadow: subtle and diffuse.
- Hover elevation is allowed for interactive cards only.
- Avoid heavy shadows, hard black drop shadows, or floating every panel.
- Dialogs and command palettes use the strongest elevation.

### Desktop app shell

```text
288px fixed sidebar | flexible main canvas
```

Sidebar:

- width: 288px (`w-72`)
- fixed or sticky for full-height desktop layouts
- `#0A0A0B` background
- logo and product name at top
- navigation in the middle
- Settings page link pinned near the bottom (Help button and New Project action are non-functional prototype controls and are not implemented)
- active navigation uses a pill container

Top bar:

- 64px minimum height
- warm translucent surface with subtle blur where supported
- global search on the left or center
- one page-level action on the right
- notification, settings, and avatar controls grouped consistently

Main canvas:

- `background` or `surface`
- 24–32px desktop padding
- 16px mobile padding
- fluid content area; do not force a narrow marketing max-width
- use a 12-column grid for complex desktop pages

### Card surface hierarchy

Use tonal containers intentionally:

1. Main canvas: `background` / `surface`.
2. Standard card: `surface-container-lowest` with `outline-variant` border.
3. Featured metric or highlighted module: `surface-container`.
4. Nested element: `surface-container-low` or `surface-container-high`.
5. Selected or active nested state: stronger orange or purple tonal fill.

---

## 8. Navigation and Information Architecture

### Client Workspace Sidebar Navigation

The navigation uses the following canonical order and labels on the desktop sidebar:

1. **Overview** (Production route: `/client/[client_id]/dashboard`, maps to the production Overview screen)
2. **Research** (Production route: `/client/[client_id]/research`)
3. **Founder Knowledge** (Production route: `/client/[client_id]/founder-experiences`, points to the existing `founder-experiences` route)
4. **Ideas** (Production route: `/client/[client_id]/ideas`)
5. **Posts** (Production route: `/client/[client_id]/posts`)
6. **Publish** (Production route: `/client/[client_id]/publish`)
7. **Settings** (Production route: `/client/[client_id]/settings`, maps to the production Settings screen)

Post Review remains strictly contextual and is never a primary navigation link.
Founder Knowledge remains a primary navigation item pointing to the existing `founder-experiences` route.
The reference layout labeled "Dashboard" maps to the production "Overview" screen.
The reference layout labeled "Setup" maps to the production "Settings" screen.

Bottom utilities:
- Settings

### Contextual and Non-Sidebar Routes

These are opened from a workflow or linked module rather than duplicated in the primary sidebar:

- Client Selector (Production route: `/clients`)
- Post Review (Production route: `/client/[client_id]/posts/[post_id]/review`)
- Login (Production route: `/login`)

Founder Experiences may be surfaced through:

- Setup summary module
- Ideas generation source card
- dedicated management page
- command palette

### Canonical user-facing terms

Use:

- Dashboard
- Business Context
- Founder Experience
- Collected Article
- TrendCard
- Idea
- Founder Take
- Post
- Post Review
- Publish Queue
- Approved for Ideas

Avoid exposing implementation language such as:

- classifier
- synthesis pipeline
- source_ids_json
- prompt chain
- research_reactions
- trend_only
- business_context_only
- raw enum or database column names

---

## 9. Global Components

### 9.1 Sidebar

- Brand block contains icon, “AIXelerate,” and “Content OS.”
- Navigation labels use 14px label typography.
- Inactive items use white at approximately 65–75% opacity.
- Hover state uses a subtle white overlay.
- Active state uses an orange or purple pill with white text.
- Use orange for operational sections such as Dashboard, Setup, and Posts.
- Use purple for intelligence and distribution sections such as Research, Ideas, and Publish.
- Do not rely on color alone: active state also uses stronger weight and filled icon state.

### 9.2 Global search

- Rounded pill input (non-functional visual placeholder only; search queries are not supported on the backend).
- Warm tinted background.
- Search icon at leading edge.
- Placeholder changes by page where useful, such as “Search signals, sources, or history…”.
- `Ctrl+K` / `Cmd+K` may open the command palette.

### 9.3 Buttons

Primary:

- solid orange or signature gradient
- white text
- 10–12px radius or full pill when matching the reference shell
- one dominant primary action per page

Secondary:

- white or transparent background
- `on-surface` text
- 1px `outline-variant` border

Tonal:

- warm peach or purple-tinted background
- used for lower-priority workflow actions

Ghost:

- transparent
- visible hover and focus treatment

Danger:

- persistent red/destructive styling
- never hidden behind hover
- reachable at 375px mobile width
- requires an accessible confirmation dialog

Delete confirmation copy:

```text
This permanently deletes “{record title}”. This action cannot be undone.
```

For Approved or Published Posts, require the user to type `DELETE` before enabling the destructive confirmation.

While deletion is pending:

- show `Deleting...`
- disable duplicate submission
- disable backdrop and Escape dismissal
- display safe inline conflict or dependency errors

### 9.4 Cards

Default card:

- white or warm tonal surface
- 1px `outline-variant` border
- 12–16px radius
- 16–24px internal padding
- shadow only when it improves hierarchy

Supported card families:

- metric card
- strategic next-step card
- client/workspace card
- source card
- research signal card
- research run card
- idea card
- post preview card
- review metadata card
- publish queue card
- setup section card
- activity card

Interactive cards must have:

- clear focus style
- optional subtle translate/elevation hover on pointer devices
- no hover-only action requirement

### 9.5 Badges and chips

Badges are compact pills with a soft background and readable contrast.

Canonical statuses include:

- Draft
- Ready
- Needs Review
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
- Agency Admin
- Client Admin
- Client User

Every status must include text; never communicate status using color alone.

### 9.6 Forms

Supported controls:

- text input
- password input
- textarea
- select
- multi-select
- tag input
- toggle
- checkbox
- radio group
- dialog form

Rules:

- label above or clearly associated with each control
- inline validation below the field
- never expose raw backend errors
- use success toast or persistent save state after completion
- preserve field values after a recoverable error
- group long Setup forms into visible sections or tabs

### 9.7 Tables

Use tables for dense operational datasets such as:

- RSS Sources
- Collected Articles
- TrendCards
- Posts
- Research Runs
- Audit Logs
- Published History

Rules:

- compact row height
- sticky header when scrolling through long data
- status badge column
- filters above the table
- row actions grouped consistently
- mobile transformation into stacked cards when horizontal scrolling would impair usability

### 9.8 Dialogs and toasts

Dialogs are used for:

- invite user
- add client
- add RSS source
- add Founder Experience
- run research confirmation
- approve or reject post
- destructive confirmation

Toasts support:

- success
- warning
- error
- information

Toasts must use safe language and must not expose stack traces, SQL errors, internal IDs, or secrets.

### 9.9 Loading and empty states

Use:

- skeleton metric cards
- skeleton list items
- skeleton table rows
- button-level loading states
- progress stepper for long-running research operations when real progress exists

Avoid full-page spinners unless the entire page is genuinely blocked.

Every empty state needs:

- a clear explanation
- one primary CTA
- optional helper copy
- no fake data inserted to make the screen look populated

---

## 10. Page Specifications

## 10.1 Login

Purpose: secure private access.

Visual composition:

- full-height warm off-white canvas
- centered compact authentication card
- AIXelerate mark, product name, and short descriptor
- email and password fields
- remember-me control if supported
- primary sign-in action
- optional SSO controls only when implemented
- small security or private-access indicator below the card

Production rules:

- do not add public signup merely because the visual reference contains “Create workspace”
- no fake Google or SSO button when the provider is not configured
- validation appears inline
- preserve existing authentication routes and recovery behavior

Safe heading:

```text
Sign in to AIXelerate Content OS
```

## 10.2 Client Selector

Purpose: choose the active Client Workspace.

Visual composition:

- light top bar with brand, workspace search, and user controls
- generous page intro spacing
- “Workspace Select” title and explanatory text
- filter chips (non-functional visual placeholder only)
- Add Client action for permitted users (restricted to agency_admin; for other users it is hidden or disabled)
- responsive grid of client cards

Client card fields:

- client name
- industry or short descriptor
- role badge
- last updated metadata
- small member/avatar group where real data exists
- clear open/select affordance

Do not show workspaces the current user cannot access.

## 10.3 Dashboard

Purpose: show the current operating state and the next useful action.

Visual composition:

- greeting and concise contextual subtitle
- top row of four compact metric cards
- large strategic next-steps module
- review queue module to the right
- lower insight/activity module where real data exists

Recommended metrics:

- Setup completeness
- Latest research result or signal count
- Collected Articles
- Ideas or posts requiring attention

Do not invent values. Empty or unavailable metrics must show a legitimate empty state.

Primary action:

- context-aware, based on the next incomplete workflow step

Examples:

- Complete Business Context
- Run Research Agent
- Generate Ideas
- Review Posts
- Open Publish Queue

## 10.4 Research

Purpose: collect sources, run research, inspect signals, and manage TrendCards.

Visual composition:

- title and concise page description
- one primary `Run Research Agent` action in the page header
- top market signals / TrendCards in a compact card grid
- recent research runs below
- intelligence sources and source-health panel on the right at desktop widths
- filters and date range controls near the content header (non-functional visual placeholders only; Research date range filtering is unsupported on the backend)

Sections:

1. RSS Sources / Intelligence Sources
2. Research Runs
3. Collected Articles
4. TrendCards / Market Signals

TrendCard fields:

- title
- shift
- why it matters
- relevance to ICP
- content angle
- confidence score
- source count and links
- Founder Take
- reaction or decision state
- approve for Ideas action

Rules:

- advanced/debug stage controls remain collapsed
- non-admin client users do not see destructive controls
- archive may appear as a historical status; current user action is Delete only when permitted
- use one primary Run Research action on desktop; a sticky equivalent may replace it on mobile, not duplicate it

## 10.5 Founder Experiences

Purpose: capture real operator experiences for future content generation.

Access:

- contextual route from Setup, Ideas, or command palette
- not required as a permanent primary-sidebar item

Layout:

- entry form for users with contribution permission
- experience log below
- optional summary preview inside Setup

Fields:

- title
- what happened
- what was learned
- what changed
- why it matters
- created and updated metadata

Primary action:

- Add Founder Experience

## 10.6 Ideas

Purpose: generate and manage content ideas from approved source types.

Visual composition:

- “Content Pipeline” heading and description
- three generation-source cards across the top corresponding to the exactly three supported Idea source concepts:
  - Founder Experience
  - TrendCard
  - Trend Reaction
- recent ideas or brainstorms below in a responsive card grid
- compact filters aligned to the section header (non-functional visual placeholders only; Ideas filtering is unsupported on the backend)

Idea card fields:

- source type
- status
- date
- title or angle
- buyer pain
- commercial relevance
- belief shift
- content pillar
- angle boundary
- source context
- proof notes
- Founder Direction

Workflow rules:

- idea without an active Post shows a prominent `Generate Post` action
- idea with an active Post shows `Post Drafted` and an `Open Post` action
- one active Post per Idea workflow
- deleting an Idea with a linked Post is blocked with a safe inline conflict message
- no Content Ideas filter in the current UI unless a feature ticket explicitly adds it

## 10.7 Posts

Purpose: manage internal post workflow states before publishing.

Tabs:

- Needs Review
- Approved
- Rejected
- Published

Each row or card links to the individual Post Review page.

Administrator delete action:

- visible without hover
- Approved and Published posts require typed `DELETE` confirmation

Posts and Publish are separate concerns:

- Posts manages internal status and review
- Publish handles manual distribution of Approved posts

## 10.8 Post Review

Purpose: review one generated post before approval.

Desktop composition:

- breadcrumb and review title at top
- approximately 65% width post preview on the left
- approximately 35% width stacked metadata cards on the right
- persistent action bar at the bottom of the review region

Left panel:

- author/client identity
- post body with preserved line breaks
- optional media preview only when real media exists
- source or hashtag context where applicable

Right panel metadata:

- buyer belief shift
- proof notes
- risk notes
- CTA intent
- source context used

Actions:

- Needs Edit
- Redraft
- Reject
- Approve

Do not use `Approve & Schedule` unless scheduling is a real supported workflow. Otherwise use `Approve` or `Approve for Publish`.

## 10.9 Publish

Purpose: manually publish Approved LinkedIn posts and record completion.

Visual composition:

- “Publishing Queue” heading and explanatory text
- Ready to Publish card grid
- Published History below as a compact table or list
- card actions aligned consistently near the bottom

Current actions:

- Copy Post Text
- Mark as Published

Rules:

- LinkedIn-only unless another channel is explicitly implemented
- no LinkedIn publishing API in the current workflow
- no auto-posting or scheduling implied by the UI
- deleting the internal Content OS record does not delete the live LinkedIn post
- use the screenshot’s card composition without copying unsupported Twitter or Instagram channels

## 10.10 Setup / Business Context

Purpose: maintain the durable context used by research and content generation.

Visual composition:

- title and explanatory copy
- Save Context action in the header
- horizontal section tabs below the top bar on desktop
- two-column content where useful
- primary business detail form on the left
- brand or context summary card on the right
- additional setup cards stacked below
- persistent save state and completion indicator

Sections:

1. Business Profile
2. ICP & Offer
3. POV & Content Pillars
4. Founder Voice
5. Proof / Success Stories
6. Banned Topics
7. Publishing Preferences
8. Team Access for administrators

Founder Experiences:

- Setup may display a recent-experience summary module with `Add Experience` and `Manage all`
- full editing and history remain in the dedicated Founder Experiences workflow

Primary action:

- Save Context

---

## 11. Command Palette and Search

Shortcut:

```text
Ctrl+K / Cmd+K
```

Suggested actions:

- Switch Client Workspace
- Go to Dashboard
- Go to Setup
- Go to Research
- Run Research Agent
- Add RSS Source
- Add Founder Experience
- Generate Ideas
- Open Posts
- Open Publish Queue

Global search may eventually search:

- clients
- founder experiences
- collected articles
- TrendCards
- ideas
- posts

A placeholder search shell is acceptable in v1 only when it is clearly non-functional or disabled. Never imply completed global search when the backend does not support it.

---

## 12. Responsive Behavior

### Desktop: 1024px and above

- full 288px sidebar
- dense multi-column cards
- Research and Post Review use asymmetric columns
- tables are preferred for dense operational data
- page padding: 24–32px

### Tablet: 768–1023px

- collapsible sidebar or navigation drawer
- two-column card grids where space allows
- right-side panels move below primary content when necessary
- maintain a visible page-level primary action

### Mobile: below 768px

- drawer navigation
- single-column content
- 16px page padding
- cards stack vertically
- tables transform into accessible cards where practical
- primary action may become sticky at the bottom
- destructive actions remain directly reachable at 375px width
- no hover-only interactions
- dialogs fit within viewport and preserve keyboard access

---

## 13. Accessibility

Minimum requirements:

- WCAG AA color contrast
- visible focus ring on every interactive control
- keyboard-navigable navigation, menus, tables, and dialogs
- accessible names for icon-only controls
- descriptive form errors
- semantic heading order
- no color-only status communication
- minimum 44px touch target for primary mobile controls
- reduced-motion support for nonessential animation
- focus restoration after dialog close
- no background interaction while a modal is open

---

## 14. Motion and Interaction

Use motion sparingly:

- 100–150ms for press and active feedback
- 150–200ms for hover, menu, and card transitions
- 200–300ms for dialogs and drawers
- use standard ease-out or Material motion curves

Permitted effects:

- subtle card elevation on hover
- button press scale of approximately 0.98
- sidebar drawer transition
- skeleton shimmer when reduced motion is not enabled

Avoid:

- bouncy animations
- continuous decorative motion
- parallax
- large gradient animation
- animations that delay operational tasks

---

## 15. Data, Permission, and Workflow Integrity

A visual refresh must preserve all existing behavior.

- Do not change routes, API paths, payload shapes, database fields, enums, or permission checks as part of visual work.
- Render only data returned by the existing application.
- Hide or disable actions according to existing permissions.
- Never hardcode a default client or workspace.
- Preserve empty, loading, error, and unauthorized states.
- Do not expose raw backend errors.
- Do not create a parallel navigation or state system.
- Do not turn manual publishing into automated publishing.
- Do not convert contextual routes into new primary navigation items without approval.

---

## 16. Implementation Rules for Claude or Coding Agents

When implementing the refresh:

1. Inspect the current route and component before editing it.
2. Preserve existing data fetching, mutations, permissions, and error mapping.
3. Reuse the current design-system and component primitives where practical.
4. Add shared tokens before copying raw hex values into many components.
5. Implement one screen or one coherent component family per commit.
6. Do not rewrite unrelated backend or domain logic.
7. Do not replace real data with screenshot placeholders.
8. Match the reference layout at the stated desktop viewport.
9. Verify tablet and 375px mobile behavior.
10. Run lint, type-check, tests, and production build after each coherent change.
11. Capture a current screenshot for visual comparison.
12. Report any reference element that conflicts with actual product behavior rather than silently adding it.

### Recommended implementation order

1. tokens, typography, icons, and base surfaces
2. desktop sidebar and top bar
3. reusable cards, badges, buttons, inputs, and dialogs
4. Login and Client Selector
5. Dashboard
6. Setup
7. Research
8. Ideas
9. Posts and Post Review
10. Publish
11. responsive and accessibility pass
12. final visual regression pass

---

## 17. Visual QA Checklist

Visual QA checks must verify both design-language fidelity and the complete preservation of existing production functionality.

Before marking a screen complete, verify:

- [ ] Design-System Consistency: Typography (Roboto Flex), colors, margins, and tonal hierarchy conform to the design tokens.
- [ ] Close Component Fidelity: Radii, borders, button/input sizes, and active nav states match visual patterns.
- [ ] Functional Completeness: Existing inputs, filters, action triggers, notifications, search, Help, and metadata fields are fully functional and present.
- [ ] Desktop layout composition adaptations are documented where current production features require different spacing or arrangements.
- [ ] Layout remains responsive and accessible (interactive at 375px without hover, WCAG AA contrast, clear focus rings).
- [ ] No mockup-only features (e.g. public signup, Google login, or cross-channel auto-publishing) are added.
- [ ] No existing feature logic or routes were deleted or hidden.
- [ ] Existing workflows and permissions still pass tests.
- [ ] The production build succeeds.

---

## 18. Compact Design Prompt

Use this prompt with the PNG references when handing the implementation to Claude or another coding agent:

```text
Refresh the existing AIXelerate Content OS interface using the attached approved PNG references and design.md.

The product is a private B2B LinkedIn content operating system. Preserve all existing routes, workflows, permissions, API contracts, database behavior, and real data. This is a UI refresh, not a backend redesign.

Match the references through:
- a near-black 288px desktop sidebar
- warm off-white main canvas
- Material 3-inspired peach tonal containers
- Roboto Flex typography
- Material-style outlined icons
- pill navigation states
- compact bordered cards
- orange operational accents
- purple research and ideation accents
- restrained orange-to-purple gradient for the highest-priority actions

Do not copy mock names, metrics, posts, users, channels, signup links, scheduling, or unsupported behavior from the images. Publish remains manual and LinkedIn-only unless the existing codebase proves otherwise.

Implement one screen or coherent component family at a time. Preserve accessibility, responsive behavior, loading states, empty states, errors, and permissions. Run lint, type-check, tests, and the production build after each coherent change.
```

---

- Independent Research Stage Controls: collapsed advanced controls for collection, classification, synthesis, and retries.
- Expanded Research Filters: source, score, run, date, and approval state.
- Expanded Posts Filters: extend the current status tabs rather than introducing a parallel filter system.
- Full cross-entity global search.
- Additional publishing channels only after explicit product and backend support.
- Automated scheduling or LinkedIn API publishing only after a separate approved feature specification.

---

## 20. Uncovered Screen and State Rules

For screens, layout components, and system states without a direct approved PNG or Stitch HTML reference, apply these rules:

### 20.1 Founder Knowledge Page
- **Route**: `/client/[client_id]/founder-experiences`
- **Visual Grid**: Reuses the core Research canvas structure (generous padding, page header with a single primary action).
- **Form Layout**: The entry form inherits the spacing, input layouts, border radius, and label placements of the Settings/Business Context form.
- **Log List**: The captured experiences log renders as a list of compact cards matching the shape and borders of default Cards (`surface-container-lowest` with `outline-variant` border and 12–16px radius).

### 20.2 Posts Page
- **Route**: `/client/[client_id]/posts`
- **Tabs**: Must preserve the existing tabs strictly: `Needs Review`, `Approved`, `Rejected`, `Published`.
- **Card/List Layout**: List elements match the card design tokens. Administrators see a clear, visible Danger "Delete" button without needing to hover.

### 20.3 Agency Pages
- **Routes**: `/agency/workspaces` and `/agency/team`
- **Visuals**: Map to the same navigation shell (near-black left sidebar, off-white background canvas, compact tables, and primary creation buttons).

### 20.4 Dialogs and Modals
- Dialog boxes use `surface-container-lowest` with strong elevational shadows.
- Sized cleanly to fit viewports, centering on the screen.
- Layout: Close button in top right, Title at top, description below, form fields, and action buttons in footer (Cancel secondary on left or right, primary action right). Backdrop click or Escape dismissal is disabled while asynchronous tasks (like deleting or running research) are in progress.

### 20.5 Loading States
- Long-running async processes (such as classifying articles, generating posts, or deleting cards) show inline loading icons, button-level pending state labels (e.g., `Deleting...` or `Generating...`), or progress steps.
- Skeleton elements represent missing lists or cards instead of full-page blocking spinners.

### 20.6 Empty States
- Consistently formatted with a display title, a concise explanation, and a single primary CTA button. No fake/mock lists are allowed.

### 20.7 Error States
- Form validation displays red inline instructions immediately below the input.
- Database/RPC errors are intercepted and displayed via client-safe messages or toasts without stack traces, database column names, or secrets.

### 20.8 Permission-Restricted States
- UI actions (such as "Delete", "Add Client", or "Run Research Agent") are hidden or completely disabled based on the authenticated user's role (e.g. `client_user` role cannot view or execute delete/run actions), maintaining structured layout grid alignment.