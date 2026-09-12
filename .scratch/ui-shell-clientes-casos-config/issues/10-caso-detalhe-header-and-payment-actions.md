# 10: Caso detalhe — header order + payment action style

**What to build:** Two small `MatterDetailView.tsx` fixes against the actual `casos-detalhe` (`18:223`) frame pixels, not just its text brief:

- **Header order.** The wireframe puts the "← Casos" back-link and "Editar caso" button in a row **above** the page title; the build currently renders the title first, with the back-link/edit row underneath. `03`'s prose listed the title bullet before the back-row bullet, which is likely why it got built in that order — flip it to match the frame: back-link/edit row on top, title below.
- **Payment action style.** "Estornar" (pago rows) and "Marcar como pago" (pendente rows) render as bordered buttons today; the wireframe draws them as plain text links, same visual family as the Prazos card's "Marcar cumprido" link (`03`). Copy itself is already correct per `03` — this is a style-only change, link instead of button.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Back-link/edit-button row renders above the page title
- [ ] "Estornar"/"Marcar como pago" render as text links, not bordered buttons — same click behavior, unchanged copy
- [ ] `tsc --noEmit` clean, `MatterDetailView.tsx`/`PaymentPanel.tsx` tests still pass
