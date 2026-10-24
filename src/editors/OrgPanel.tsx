import { useState } from "react";
import { loadDepartments, loadSenders, loadUnits, toOptions } from "../api/lookups";
import type { Department, RecipientGroup, Unit } from "../api/types";
import { ResourceManager } from "../components/ResourceManager";
import { Badge } from "../components/ui";
import { useLoad } from "../hooks/useLoad";

const aliasHelp = "Other spellings used in the Excel files (e.g. 'Plant-1', 'P1'). Matching ignores case and extra spaces.";

export function UnitsManager({ onChange }: { onChange?: () => void }) {
  return (
    <ResourceManager<Unit>
      title="Units" endpoint="/units/" defaults={{ code: "", name: "", aliases: [], active: true }}
      columns={[{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "aliases", label: "Aliases", render: (u) => u.aliases.join(", ") },
        { key: "active", label: "Status", render: (u) => <Badge tone={u.active ? "good" : "neutral"}>{u.active ? "active" : "inactive"}</Badge> }]}
      fields={[{ key: "code", label: "Code", type: "text", required: true }, { key: "name", label: "Name", type: "text", required: true },
        { key: "aliases", label: "Aliases", type: "chips", help: aliasHelp }, { key: "active", label: "Active", type: "checkbox" }]}
      onSaved={onChange}
      itemLabel={(u) => u.name}
    />
  );
}

export function DepartmentsManager({ onChange }: { onChange?: () => void }) {
  return (
    <ResourceManager<Department>
      title="Departments" endpoint="/departments/" defaults={{ code: "", name: "", aliases: [], active: true }}
      columns={[{ key: "code", label: "Code" }, { key: "name", label: "Name" }, { key: "aliases", label: "Aliases", render: (u) => u.aliases.join(", ") },
        { key: "active", label: "Status", render: (u) => <Badge tone={u.active ? "good" : "neutral"}>{u.active ? "active" : "inactive"}</Badge> }]}
      fields={[{ key: "code", label: "Code", type: "text", required: true }, { key: "name", label: "Name", type: "text", required: true },
        { key: "aliases", label: "Aliases", type: "chips", help: aliasHelp }, { key: "active", label: "Active", type: "checkbox" }]}
      onSaved={onChange}
      itemLabel={(u) => u.name}
    />
  );
}

export function RecipientsManager({ version = 0 }: { version?: number }) {
  const units = useLoad(loadUnits, [version]);
  const departments = useLoad(loadDepartments, [version]);
  const senders = useLoad(loadSenders, [version]);
  return (
    <ResourceManager<RecipientGroup>
      title="Recipients per unit-department" endpoint="/recipient-groups/" deps={[version]}
      description="One consolidated email per unit-department per day goes to these addresses. Records for a unit-department without an active group are reported to admins."
      defaults={{ unit: null, department: null, to_emails: [], cc_emails: [], sender_profile: null, active: true }}
      columns={[
        { key: "unit_name", label: "Unit" }, { key: "department_name", label: "Department" },
        { key: "to_emails", label: "To", render: (g) => g.to_emails.join(", ") || <Badge tone="critical">none</Badge> },
        { key: "cc_emails", label: "Cc", render: (g) => g.cc_emails.join(", ") },
        { key: "warnings", label: "Checks", render: (g) => (g.warnings.length ? g.warnings.map((w) => <Badge key={w} tone="warning">{w}</Badge>) : g.active ? <Badge tone="good">ok</Badge> : <Badge>inactive</Badge>) },
      ]}
      fields={[
        { key: "unit", label: "Unit", type: "select", options: toOptions(units.data), required: true, numeric: true },
        { key: "department", label: "Department", type: "select", options: toOptions(departments.data), required: true, numeric: true },
        { key: "to_emails", label: "To", type: "emails", required: true, help: "Press Enter or comma after each address." },
        { key: "cc_emails", label: "Cc", type: "emails" },
        { key: "sender_profile", label: "Sender override (optional)", type: "select", options: toOptions(senders.data), numeric: true },
        { key: "active", label: "Active", type: "checkbox" },
      ]}
      itemLabel={(g) => `${g.unit_name} / ${g.department_name}`}
    />
  );
}

export function OrgPanel({ onChange }: { onChange?: () => void }) {
  const [version, setVersion] = useState(0);
  const changed = () => {
    setVersion((v) => v + 1);
    onChange?.();
  };
  return (
    <div className="stack">
      <div className="grid-2">
        <UnitsManager onChange={changed} />
        <DepartmentsManager onChange={changed} />
      </div>
      <RecipientsManager version={version} />
    </div>
  );
}
