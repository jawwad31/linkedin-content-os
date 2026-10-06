# design.md — Personal-brand Content OS

Updated 2026-10-06. Visual foundation preserved from the current repository. New screen requirements below are planned; implement only the assigned phase.

## Authority

AGENTS.md and security-access.md govern product/security. The approved product specification controls the new workflows. Existing PNGs and Stitch exports determine visual language, not feature scope. Do not revert to the older uploaded Poppins/cold-white palette. Preserve the live Roboto Flex/warm tonal system.

## 2. Approved Visual References

Use the following actual visual references from the repository:

| File path | Screen | Production Route | Coverage |
|---|---|---|---|
| `ui-reference/login_m3_updated_colors/05_login.png` | Login | `/login` | Covered |
| `ui-reference/client_selector_material_3/03_client_selector.png` | Client Selector | `/clients` | Covered |
| `ui-reference/dashboard_m3_updated_colors/01_dashboard.png` | Overview | `/client/[client_id]/dashboard` | Covered |
| `ui-reference/research_m3_updated_colors/02_research_hub.png` | Research | `/client/[client_id]/research` | Covered |
| None | Founder Experiences | `/client/[client_id]/founder-experiences` | Uncovered |
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
- The historic Founder Experiences reference informs Content Bank styling; functionality follows the new product specification.
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


## Target navigation and screen contracts

Keep Overview and Settings. Evolve the main workflow navigation to Content Bank, Research, Calendar, Posts, and Newsletter. Personal/business Profile tabs live within Settings. Ideas can remain as a compatibility/advanced route within Posts; Publish can remain an approved/manual-publication view within Posts. Do not remove useful functionality while consolidating sidebar labels.

Old Founder Experiences and Resources URLs must preserve deep links through adapters/redirects after equivalent Content Bank functionality is live. All route changes require explicit phase implementation, not a visual-only commit. Never show a live Newsletter or Calendar navigation item pointing to an unimplemented destination.

### Settings / Profile

Tabs: Business context, Personal brand, Supporting documents, Team access. Ask the concrete questions in product-spec.md. Required fields are minimal; optional sections expand. No revenue targets, business goals, mandatory proof questionnaire, profile autofill, or document-conflict alerts. Existing team controls retain permissions and password flows.

### Content Bank

One list with category/readiness/reuse filters, search, and usage history. Lead magnets are a distinct filter. Start with one capture textarea and optional category, files, links. Show AI-organized suggestions for confirmation. Detail view shows source/evidence/download purpose and Create post, Add to calendar, Use in newsletter. Show Allow reuse as off initially. Reuse history is visible before a second selection.

### Calendar

Month header and accessible list/calendar toggle. Settings display post count, primary-source shares, news maximum, pillar/funnel targets, timezone, and requested versus actual counts. Numeric fields with inline validation supplement any sliders.

Show **Save for this month** and **Save as default** as distinct actions with explicit effects. Default changes never silently replan the current month. The calendar uses a saved snapshot and a visible replan preview. Candidate selection precedes reservation and drafting. Cards show source, topic, pillar, type, funnel stage, and status. A news placeholder must look unfinished. Show per-slot retry and progress for user-triggered batch generation.

### Posts / Editor

Main controls: sources, topic/instructions, pillar, post type, funnel stage. Suggested reader and takeaway are visible/editable. Advanced options: length/depth, tone, CTA, business mention. Default AI choices to Auto while exposing resolved values. Keep hook/body taxonomies internal. Evidence has its own panel. Draft actions revise the actual text. Retain QA results and human review. Do not label a planned manual publication time as automatically scheduled to LinkedIn.

### Research

Saved prompt is a large editable admin field, with Save, Run saved prompt, schedule/timezone, pause, lookback, monitored URLs, and optional profile context (off). When edited but unsaved, distinguish Save and run from Run saved prompt. Findings show direct links, dates, what changed, consequence, action/angle, confidence, novelty, and coverage gaps. Multi-select offers Create separate posts or Add to newsletter; combining is deliberate. Keep RSS history accessible during transition without requiring feed setup.

### Newsletter

Separate edition list/editor. Select sources, arrange sections, confirm outline, draft, QA/review, copy/export, mark manually published. Show date range and source/evidence links. Experiences work alongside news. Do not invent an API Publish button.

### States and usability

Every new surface handles loading, empty, saving, safe failure, denied access, partial progress, and retry. All controls must work at 375px, 768px, and desktop widths. Provide keyboard movement alternatives to drag-and-drop. Do not hide denied actions only in CSS; server enforcement remains mandatory. Show real saved data only. Do not include implementation details in product copy unless needed to make a decision.

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


## Visual validation

Verify current color/type tokens, focus/contrast, responsive layout, labels, real data, permissions, empty/error states, and actual workflow actions. Visual changes alone do not authorize changes to business rules. Keep before/after evidence for changed screens in the phase report.
