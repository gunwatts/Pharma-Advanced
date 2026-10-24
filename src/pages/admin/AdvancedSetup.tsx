import { useSearchParams } from "react-router-dom";
import type { Permission } from "../../api/types";
import { useAuth } from "../../auth/AuthContext";
import { Forbidden, PageHeader } from "../../components/ui";
import { MappingPanel } from "../../editors/MappingPanel";
import { OrgPanel } from "../../editors/OrgPanel";
import { RulePanel } from "../../editors/RulePanel";
import { SenderPanel } from "../../editors/SenderPanel";
import { SourcePanel } from "../../editors/SourcePanel";
import { TemplatePanel } from "../../editors/TemplatePanel";
import { CategoriesSection } from "./Catalog";
import { DashboardBuilder } from "./DashboardBuilder";
import { SchedulesSection } from "./Schedules";
import { UsersSection } from "./Users";

const SECTIONS: { key: string; label: string; perm: Permission; render: () => JSX.Element }[] = [
  { key: "catalog", label: "Categories, fields & relationships", perm: "admin.configure", render: () => <CategoriesSection /> },
  { key: "org", label: "Units, departments & recipients", perm: "admin.configure", render: () => <OrgPanel /> },
  { key: "sources", label: "Sources & Excel mappings", perm: "admin.configure", render: () => <div className="stack"><SourcePanel /><MappingPanel /></div> },
  { key: "senders", label: "Email senders", perm: "admin.configure", render: () => <SenderPanel /> },
  { key: "rules", label: "Reminder rules", perm: "admin.configure", render: () => <RulePanel /> },
  { key: "templates", label: "Email templates", perm: "admin.configure", render: () => <TemplatePanel /> },
  { key: "schedules", label: "Schedules, alerts & settings", perm: "admin.configure", render: () => <SchedulesSection /> },
  { key: "users", label: "Users, roles & data scopes", perm: "admin.users", render: () => <UsersSection /> },
  { key: "dashboards", label: "Dashboard builder", perm: "dashboards.manage", render: () => <DashboardBuilder /> },
];

export default function AdvancedSetup() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const allowed = SECTIONS.filter((s) => can(s.perm));
  if (!allowed.length) return <Forbidden />;
  const current = allowed.find((s) => s.key === params.get("section")) ?? allowed[0];
  return (
    <>
      <PageHeader title="Advanced Setup" subtitle="Full configuration. Changes are audited; destructive changes show what they affect before you confirm." />
      <div className="setup-layout">
        <nav className="subnav" aria-label="Setup sections">
          {allowed.map((s) => (
            <button type="button" key={s.key} className={`subnav-item ${s.key === current.key ? "subnav-active" : ""}`} aria-current={s.key === current.key ? "page" : undefined}
              onClick={() => setParams({ section: s.key })}>{s.label}</button>
          ))}
        </nav>
        <div className="setup-body" key={current.key}>{current.render()}</div>
      </div>
    </>
  );
}
