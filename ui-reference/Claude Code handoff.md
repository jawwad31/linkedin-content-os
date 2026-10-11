# Claude Code handoff: Phase 1 wireframes

Source of truth for the new UI: `Virel Phase 1 Wireframes.dc.html`. Open it in a browser. Screen ids (a1, b2, d1...) are referenced below.

## Paste this into Claude Code

```
Repo: jawwad31/linkedin-content-os. Read ui-reference/screen-map.md first.

We are redesigning the UI. The wireframes are in "Virel Phase 1 Wireframes.dc.html" (project root, or the copy I attached). Treat them as the spec for layout, labels and behavior. They are grayscale on purpose: do not copy their styling, use the existing app components.

Do this in order, one step at a time, and show me a plan before changing code:
1. Navigation: six sidebar items (Content Bank, Calendar, Posts, Newsletter, Research, Settings). Ideas, Publish, Overview and the client selector are removed. See 1a.
2. Flow B, Add to Calendar (1c, b1 to b4) CHANGED from the old behavior. It is no longer a monthly plan with shares, preview and confirm. It is:
   - Choose this month or next month, then a date.
   - If the date already has a post, ask "Add another post on this day?" Yes creates a second post on that day. No limit per day.
   - The entry is reserved for that date.
   - The monthly mix (experience, asset, evergreen, news shares) is recalculated in the backend only. Nothing about it is shown in the UI.
   Find the existing plan/preview/confirm endpoints and UI and tell me what can be removed or must change in the backend before editing.
3. Calendar (1d): month view, slot states Reserved, Drafting, Drafted (no Planned). Replan month opens a dialog listing this month's reserved entries, each with a date field; Save moves all changed ones at once (mockup 5a).
4. Create post, drafting, review, publish handoff, research and newsletter: follow 1b, 1e, 1f, 1i.
5. States (1g) and permissions (1h): follow them.

Decisions already made: one account per company (no agency level); research findings are saved to Content Bank as a trend reaction first, then used like any entry; a rejected post frees its single-use entry; an editor can approve their own version if they have Review; anyone can add entries to the calendar.

Keep backend behavior unchanged unless the wireframes say otherwise. List every backend change you propose before making it.
```

## Color mockups (Phase 2)
The same file now has full-color mockups above the wireframes, in the Avelune design system: turn 3 (3a to 3f: Content Bank, Add to Calendar, date conflict, Calendar month, Post review, Create post), turn 4 (4a to 4f: Newsletter list, sources, review; Research prompt and briefing; phone post review) and turn 5 (5a to 5d: Replan month, newsletter approved, phone Calendar, Settings Team access). Use them for visual style, spacing and components. Wireframe ids still define behavior. Names and text in them are sample content.

Add to the prompt above: "Use the color mockups (turns 3 to 5) as the visual target, built with the repo's existing components. Where a mockup and a wireframe differ, ask me."

## How to attach the wireframes
Add `Virel Phase 1 Wireframes.dc.html` and this file to the repo in a `ui-reference/` folder, or attach them in the Claude Code chat. Download both from this project.
