# AIXelerate Content OS — UI Reference Package

## Purpose

This directory contains approved Google Stitch UI references for the AIXelerate Content OS interface refresh.

These screenshots and Stitch HTML/code exports are design-language references illustrating color system, tonal surfaces, typography, component proportions, spacing, layout patterns, and states (loading, empty, error, and interaction). They are not authoritative definitions of feature inventories, product functionality, routes, workflow behaviors, role permissions, or backend capabilities.

---

## Source-of-Truth Priority

“The production application determines what exists and how it works. The UI references determine how it should look and feel.”

When sources appear to conflict, use this exact priority order:

1. **Production application and governing product/security requirements**: This includes features, routes, navigation, UX flows, permissions, data states, actions, validations, APIs, database tables, RLS policies, and background worker behavior.
2. **`design.md`**: The normalized, reusable design system, visual tokens, and UI implementation guidelines.
3. **Approved PNG and Stitch references**: Visual examples used to extract component patterns, layout approaches, spacing, and responsive intent.
   - Within the reference package, the PNG controls the visible appearance, and the Stitch HTML helps inspect measurements/structure. Do not treat PNGs as mandatory pixel-perfect replicas.

### Functional Preservation and Existing Features
- **Preserve Production Behavior**: Every existing production feature must remain fully functional during the UI refresh. Do not remove, hide, disable, rename, or downgrade a feature merely because it is absent from a reference screenshot or Stitch prototype.
- **Preserve Controls**: Do not remove, hide, or alter the functionality of any existing control (including global search, notification indicators/controls, command palette, Help sidebar triggers, filters, client switcher actions, admin features, or metadata) merely because it is not illustrated or is placed differently in the prototype references.
- **Adapt UX**: Adapt all existing features (including loading states, empty states, error handling, destructive confirmations, and role-based views) into the new visual design language without stripping away actual logic. Reorganization of layouts is permitted only if the underlying workflows and options remain fully intact.
- **No Prototype-only Code**: Do not invent or add new prototype-only functionalities (such as fake mock metrics, public signup routes, SSO options, Twitter/Instagram publishing options, or automated scheduling screens) if they are not backed by backend APIs or explicit feature checklist tickets.

---

## Production Architecture Must Remain

The production application uses:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Auth
- Supabase Postgres
- Supabase Row-Level Security
- Railway
- OpenRouter

Do not replace or bypass this architecture.

Do not copy prototype:

- routing
- mock authentication
- fake data
- hardcoded workspaces
- local-only state
- unsupported dependencies
- backend logic
- API behavior
- database logic

---

## Current Client Workspace Navigation

Use this exact order and wording:

1. Overview
2. Research
3. Founder Knowledge
4. Ideas
5. Posts
6. Publish
7. Settings

Post Review is contextual and appears only while viewing a specific Post.

---

## Screen Map

| Reference Folder | Production Route | Purpose |
|---|---|---|
| `login_m3_updated_colors/` | `/login` | Secure private access (Login) |
| `client_selector_material_3/` | `/clients` | Choose Client Workspace (Workspace Select) |
| `dashboard_m3_updated_colors/` | `/client/[client_id]/dashboard` | Workspace operating summary (Overview) |
| `research_m3_updated_colors/` | `/client/[client_id]/research` | RSS Sources, Articles, Research Runs, and TrendCards (Research) |
| None (Uncovered screen) | `/client/[client_id]/founder-experiences` | Founder Experiences and Trend Reactions (Founder Knowledge) |
| `ideas_material_3/` | `/client/[client_id]/ideas` | Content Ideas and Founder Direction (Ideas) |
| None (Uncovered screen) | `/client/[client_id]/posts` | Internal Post workflow (Posts) |
| `post_review_m3_updated_colors/` | `/client/[client_id]/posts/[post_id]/review` | Review, edit, approve, reject, and redraft (Post Review) |
| `publish_queue_material_3/` | `/client/[client_id]/publish` | Manual publishing queue and history (Publish) |
| `setup_material_3/` | `/client/[client_id]/settings` | Always-on business context and team access (Settings) |

Add additional rows when new approved reference folders are added.

---

## Visual Implementation Rules

The PNG files are the visual acceptance target.

Match as closely as reasonably possible:

- sidebar width
- header height
- page padding
- content width
- card dimensions
- grid structure
- gaps
- typography
- button height and padding
- input height
- badge size
- icon size
- border radius
- borders
- shadows
- tabs
- tables
- dialogs
- overlays
- empty states
- loading states
- mobile stacking

Do not merely take loose inspiration from the references.

Use existing production components whenever possible.

Prefer refining shared components over adding repeated screen-specific styles.

---

## Functional Preservation

The UI refresh must not change:

- routes
- API contracts
- database schema
- migrations
- Supabase queries
- authentication
- authorization
- roles
- RLS
- workflow statuses
- Research Agent behavior
- Planning Agent behavior
- Content Agent behavior
- one-active-Post-per-Idea behavior
- Post review workflow
- Publish workflow
- delete dependency rules
- confirmation requirements
- audit events
- worker behavior
- environment variables

Existing required functionality must remain even when it is absent from a
reference screen.

Place missing production actions naturally inside the approved design language.

---

## Screens Without Direct References

For screens or states without an approved PNG:

1. Use the closest referenced screen family.
2. Reuse the same layout system.
3. Reuse the same typography.
4. Reuse the same cards, buttons, badges, forms, dialogs, and tabs.
5. Preserve existing functionality.
6. Do not introduce a separate visual language.
7. Apply the same desktop and mobile behavior.
8. Keep permission-restricted actions consistent.
9. Keep destructive actions consistent.

### Specific Uncovered Screen Rules:
- **Founder Knowledge**: Route: `/client/[client_id]/founder-experiences`. Inherits its layout, grid composition, page headers, inputs, cards, borders, and margins from the closest list/table and Setup form references. Points to the existing `founder-experiences` route.
- **Posts**: Route: `/client/[client_id]/posts`. Renders as an administrative list/table inheriting default card typography and borders, preserving existing tabs: `Needs Review`, `Approved`, `Rejected`, `Published`.
- **Agency Pages**: Routes: `/agency/workspaces` and `/agency/team`. Inherits the core desktop layout shell (near-black left navigation sidebar, off-white main background canvas, primary buttons, and compact tables).
- **Dialogs & Modals**: dialog overlays use white surfaces (`surface-container-lowest`), standard elevation shadows, top right close icons, cancellation actions on the left, and primary actions on the right. Escape and backdrop click dismissals are disabled while async processes are running.
- **Loading States**: Skeletons or stepper structures replace missing content blocks. Full-page loaders are avoided.
- **Empty States**: Configured with a display heading, explanatory description, and one primary action button against the peach tonal canvas. No mock lists/placeholders.
- **Error States**: Form validation displays inline errors directly below inputs. Database/RPC error states are intercepted and shown as generic safe messages or toasts (excluding raw database strings, enums, column names, or stack traces).
- **Permission-restricted states**: Administrative actions (such as deletion controls, workspace creation, or running agent tasks) are hidden or visually disabled based on the user's role (e.g. `client_user`), maintaining layout structure.

---

## Responsive Requirements

Validate each screen at:

- 1440px desktop
- 1024px tablet
- 768px small tablet
- 375px mobile

At 375px:

- no horizontal page overflow
- no hover-only actions
- cards stack cleanly
- action groups wrap
- dialogs fit inside the viewport
- tabs remain accessible
- destructive actions remain visible
- tables convert to cards or safe scrollable regions
- long labels do not overlap
- primary actions remain discoverable

---

## Current Scope Exclusions (Unsupported Prototype Controls)

The following items are either deferred to V2 or represent **non-functional visual placeholders** in the prototype reference packages:

- **New Project**: Pinned sidebar action is not implemented/supported.
- **Help**: Pinned sidebar help module is not implemented.
- **global search**: Sidebar top search input is a visual placeholder.
- **notifications**: Notification indicators are visual placeholders.
- **Add Client**: workspace creation action is restricted to the `agency_admin` role.
- **filter chips**: client select filter chips are non-functional visual placeholders.
- **Research date filters**: date inputs in the Research Hub are non-functional placeholders.
- **Ideas filters**: Idea list categorization filters are non-functional placeholders. No Ideas filters should be added.
- **Expanded Posts/Research filters**: Deferred to V2. Post status tabs must be preserved.

These are deferred to V2 unless explicitly activated. Do not implement prototype behaviors that replace or conflict with existing production functions. Reference packages are read-only; implementation must proceed one screen or component family at a time.

---

## Implementation Workflow

Implement one screen or one coherent component family per focused commit.

Recommended sequence:

1. Design tokens and shared primitives
2. App shell and navigation
3. Overview
4. Research
5. Founder Knowledge
6. Ideas
7. Posts
8. Post Review
9. Publish
10. Settings
11. Agency pages
12. Final responsive and consistency pass

Before every change, read:

1. `AGENTS.md`
2. `security-access.md`
3. `design.md`
4. `feature-checklist.md`
5. `CONTRIBUTING.md`

A screen is complete only after:

- lint passes
- build passes
- commit is pushed
- Railway deployment succeeds
- desktop comparison is completed
- 375px comparison is completed
- functionality is manually tested
- role-specific actions are tested
- dialogs and destructive states are tested

---

## Important Instruction to Coding Agents

The screenshots are the visual acceptance target.

The Stitch code is a secondary visual reference only.

Do not copy the prototype application architecture into production.

Implement the design using the existing production architecture, real data,
existing routes, existing APIs, existing role checks, and existing workflow
behavior.