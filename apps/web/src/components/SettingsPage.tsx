import * as React from "react";
import { Card } from "@/components/ui/card";
import { MembersTable } from "@/modules/tenants/components/MembersTable";
import { CatalogSettings } from "@/modules/catalog/components/CatalogSettings";
import { TagsSettings } from "@/modules/tags/components/TagsSettings";

const tabs = [
  { id: "equipe", label: "Equipe" },
  { id: "catalogo", label: "Catálogo" },
  { id: "tags", label: "Tags" },
  { id: "auditoria", label: "Auditoria" },
] as const;

type TabId = (typeof tabs)[number]["id"];

/**
 * Auditoria's real content is ticket 05's job (a read-only `audit_log`
 * listing — see spec.md's "New in this feature" audit section, plus the
 * still-open RBAC decision on whether the tab is admin-only). This stub
 * exists only so the tab is reachable and visually consistent with the
 * other three in the meantime — ticket 05 replaces just this one branch in
 * the switch below with its real component, nothing else here should need
 * to change.
 */
function AuditoriaStub() {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Auditoria</h2>
      <p className="text-sm text-muted-foreground">Em breve.</p>
    </div>
  );
}

/**
 * `/settings` (ui-shell-clientes-casos-config/04) — reachable only from
 * AppShell's avatar dropdown, no top-nav entry. Builds Equipe/Catálogo/Tags;
 * Auditoria is a stub here (ticket 05's job, see AuditoriaStub above).
 */
export function SettingsPage() {
  const [active, setActive] = React.useState<TabId>("equipe");

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4">
      <h1 className="text-xl font-semibold">Configurações</h1>

      <div role="tablist" aria-label="Configurações" className="flex gap-6 border-b text-sm">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`settings-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`settings-panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={
                isActive
                  ? "border-b-2 border-foreground pb-2 font-medium text-foreground"
                  : "pb-2 text-muted-foreground hover:text-foreground"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <Card>
        <div role="tabpanel" id={`settings-panel-${active}`} aria-labelledby={`settings-tab-${active}`} className="p-6">
          {active === "equipe" && <MembersTable />}
          {active === "catalogo" && <CatalogSettings />}
          {active === "tags" && <TagsSettings />}
          {active === "auditoria" && <AuditoriaStub />}
        </div>
      </Card>
    </div>
  );
}
