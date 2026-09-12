import * as React from "react";
import { Card } from "@/components/ui/card";
import { MembersTable } from "@/modules/tenants/components/MembersTable";
import { CatalogSettings } from "@/modules/catalog/components/CatalogSettings";
import { TagsSettings } from "@/modules/tags/components/TagsSettings";
import { AuditSettings } from "@/modules/audit/components/AuditSettings";

const tabs = [
  { id: "equipe", label: "Equipe" },
  { id: "catalogo", label: "Catálogo" },
  { id: "tags", label: "Tags" },
  { id: "auditoria", label: "Auditoria" },
] as const;

type TabId = (typeof tabs)[number]["id"];

/**
 * `/settings` (ui-shell-clientes-casos-config/04, Auditoria filled in by
 * `05`) — reachable only from AppShell's avatar dropdown, no top-nav entry.
 * Equipe/Catálogo/Tags/Auditoria all real; see each tab's own component for
 * its module's specifics.
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
          {active === "auditoria" && <AuditSettings />}
        </div>
      </Card>
    </div>
  );
}
