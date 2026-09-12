# 08: Casos table — restore AÇÕES header + open-row affordance

**What to build:** `MattersTable.tsx` is missing its "AÇÕES" column header, and the wireframe's bare chevron (`›`, whole row links to `/matters/:id`) has been replaced by an Archive-only icon with nothing indicating the row opens. This is a regression, not a fidelity gap in the original build: `03` explicitly specified "AÇÕES column is a bare chevron — whole row is a link to `/matters/:id`, no separate edit/archive icons here." `01`'s 2026-09-12 code-review pass then added an Archive button back to fix a genuinely lost soft-delete action — correctly, per its own finding — but that add displaced the chevron and the column header along with it.

Fix: restore the "AÇÕES" header label and the chevron as a visible open-row indicator, while keeping the Archive action the code review added (it's a real, needed capability — don't remove it to get back to the original bare-chevron spec). Whole row stays clickable to `/matters/:id`; the chevron is decorative confirmation of that, the Archive icon is the one actual secondary action in the column — same two-icons-plus-affordance shape `ClientsTable.tsx` (`02`) already establishes for its own AÇÕES column.

**Blocked by:** `07` (touches the same table header row this ticket restores a label to — sequence after the shared shading fix lands to avoid two tickets editing the same header markup in parallel)

**Status:** done

- [x] "AÇÕES" header renders over the Casos table's action column
- [x] Chevron (or equivalent open-row visual cue) is back, whole row still links to `/matters/:id`
- [x] Archive (soft-delete) icon/action stays working, unchanged behavior
- [x] `tsc --noEmit` clean, `MattersTable.tsx` tests updated/still passing (no dedicated component tests exist; full suite passes)

## Comments

- 2026-09-12: The chevron itself (`›` span after the Archive button) turned out to already be in place — only the "AÇÕES" header label was actually missing. One-line fix.
