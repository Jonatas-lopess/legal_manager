# 06: Shell top-bar fidelity fix

**What to build:** `AppShell.tsx`'s top bar (built in `01`) currently drifts from the wireframe on every route. Bring it into line, in place — same component, no new one:

- Logo: add the square "L" mark next to the "Legal Manager" wordmark, plus the "SaaS de Gestão Jurídica" subtitle line underneath the wordmark (both drawn in every `18:*` frame and `4:164`/`4:5`).
- Nav links (`Clientes | Casos | Métricas | Prazos`): center them in the bar instead of left-aligning immediately after the logo — logo stays left, avatar/bell stay right, links move to the middle.
- Avatar: show the signed-in member's name and role/OAB-style line under it (wireframe shows e.g. "Dr. Marcos Silva" / "OAB/SP 123.456"), not a bare initial circle with nothing else. `users.name` already exists; OAB/registration number has no column today — render whatever identifying line the schema actually backs (name + role label, e.g. "Admin"/"Advogado(a)"/"Secretário(a)") rather than inventing an OAB field. Flag if a real OAB field is wanted — that's a schema addition, out of scope here.
- Notification bell: render as an icon (bell glyph, `lucide-react` already in use per `02`'s `Pencil`/`Archive` precedent) instead of the "Notificações" text link.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Logo mark + subtitle render on every authenticated route
- [x] Nav links visually centered in the bar (logo left, avatar/bell right, links in the middle) at both desktop and the app's existing responsive breakpoints — centered via absolute positioning within a `relative` header, independent of left/right content width
- [x] Avatar shows name + role line, not just an initial
- [x] Notification affordance is an icon, not a text link — same click behavior as today (`NotificationsDropdown` unchanged otherwise)
- [x] `tsc --noEmit` clean, existing shell-related tests still pass
- [x] Reviewed against `cap1.png` (no `18:*`/`4:164` Figma MCP access, no browser/screenshot tool in this environment — same caveat `ui-shell-clientes-casos-config/01`'s dev-server verification flagged); no component tests exist for `AppShell.tsx`/`NotificationsDropdown.tsx` to run beyond `tsc`

## Comments

- 2026-09-12: Implemented alongside tickets 07-11. No real OAB field exists — avatar renders `users.name` + role label (Admin/Advogado(a)/Secretário(a)), flagging per the ticket that a literal OAB/registration-number column would be a separate schema addition.
